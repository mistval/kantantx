import assert from 'assert';
import _omitBy from 'lodash.omitby';
import _omit from 'lodash.omit';
import { IDatabaseAdapter } from "../types/database_adapter";
import { Role } from "../types/enums";
import betterSqlite3 from "better-sqlite3";
import { ConflictError, NotFoundError } from '../types/errors';
import { IPublicUser, ISensitiveUser } from '../types/user';
import { ISourceDocument, ISourceString, IStringHistory, ITranslatedDocument } from '../types/api_schemas/strings';

export interface IRawUser {
  id: number;
  username: string;
  passwordHash: string;
  role: Role;
  apiKey: string;
  languageCodes: string;
}

export interface IRawSourceString {
  key: string;
  value: string;
  additionalFields: string;
}

function parseRawDBUser(rawUser: IRawUser): ISensitiveUser {
  return {
    ...rawUser,
    languageCodes: JSON.parse(rawUser.languageCodes),
  };
}

function parseRawDBString(rawString: IRawSourceString): ISourceString {
  return {
    ...rawString,
    additionalFields: rawString.additionalFields && JSON.parse(rawString.additionalFields).map((field: any) => ({
      ...field,
      uiHidden: Boolean(field.uiHidden),
    })),
  };
}

export class BetterSQLite3Database implements IDatabaseAdapter {

  /* TABLES */

  // @ts-expect-error
  private readonly createUsersTableResult = this.db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL,
      apiKey TEXT NOT NULL UNIQUE
    );
  `);

  // @ts-expect-error
  private readonly createTranslatorLanguageTableResult = this.db.exec(`
    CREATE TABLE IF NOT EXISTS user_languages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      languageCode TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id),
      UNIQUE (userId, languageCode)
    );
  `);

  // @ts-expect-error
  private readonly createDocumentsTableResult = this.db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
  `);

  // @ts-expect-error
  private readonly createSourceStringsTableResult = this.db.exec(`
    CREATE TABLE IF NOT EXISTS source_strings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      documentId INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      valueLastUpdatedDate DATETIME NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')),
      softDeleted INTEGER NOT NULL DEFAULT FALSE,
      stringOrder INTEGER NOT NULL,
      FOREIGN KEY (documentId) REFERENCES documents(id) ON DELETE CASCADE,
      UNIQUE (documentId, key)
    );
  `);

  // @ts-expect-error
  private readonly createSourceStringsAdditionalFieldsTableResult = this.db.exec(`
    CREATE TABLE IF NOT EXISTS source_string_additional_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sourceStringId INTEGER NOT NULL,
      fieldName TEXT NOT NULL,
      value TEXT NOT NULL,
      softDeleted INTEGER NOT NULL DEFAULT FALSE,
      uiHidden INTEGER NOT NULL DEFAULT FALSE,
      FOREIGN KEY (sourceStringId) REFERENCES source_strings(id) ON DELETE CASCADE,
      UNIQUE (sourceStringId, fieldName)
    );
  `);

  // @ts-expect-error
  private readonly createTranslatedStringsTableResult = this.db.exec(`
    CREATE TABLE IF NOT EXISTS translated_strings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sourceStringId INTEGER NOT NULL,
      languageCode TEXT NOT NULL,
      value TEXT NOT NULL,
      valueLastUpdatedDate DATETIME NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')),
      FOREIGN KEY (sourceStringId) REFERENCES source_strings(id) ON DELETE CASCADE,
      UNIQUE(sourceStringId, languageCode)
    );
  `);

  // @ts-expect-error
  private readonly createStringHistoryTableResult = this.db.exec(`
    CREATE TABLE IF NOT EXISTS string_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sourceStringId INTEGER NOT NULL,
      languageCode TEXT NOT NULL,
      eventType TEXT NOT NULL,
      value TEXT NOT NULL,
      eventDate DATETIME NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')),
      userId INTEGER NOT NULL,
      FOREIGN KEY (sourceStringId) REFERENCES source_strings(id) ON DELETE CASCADE,
      FOREIGN KEY (userId) REFERENCES users(id)
    );
  `);

  /* QUERIES */

  private readonly createUserStatement = this.db.prepare(`
    INSERT INTO users (username, passwordHash, role, apiKey)
    VALUES (?, ?, ?, ?)
    RETURNING *, '[]' AS languageCodes;
  `);

  private readonly insertUserLanguageCodeStatement = this.db.prepare(`
    INSERT INTO user_languages (userId, languageCode)
    VALUES (?, ?);
  `);

  private readonly setUserPasswordStatement = this.db.prepare(`
    UPDATE users
    SET passwordHash = ?
    WHERE id = ?;
  `);

  private readonly setUserApiKeyStatement = this.db.prepare(`
    UPDATE users
    SET apiKey = ?
    WHERE id = ?;
  `);

  private readonly upsertDocumentStatement = this.db.prepare(`
    INSERT INTO documents (name)
    VALUES (?)
    ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
    RETURNING id;
  `);

  private readonly softDeleteDocumentSourceStringsStatement = this.db.prepare(`
    UPDATE source_strings
    SET softDeleted = TRUE
    WHERE documentId = ?;
  `);

  private readonly softDeleteDocumentSourceStringAdditionalFieldsStatement = this.db.prepare(`
    UPDATE source_string_additional_fields
    SET softDeleted = TRUE
    WHERE sourceStringId IN (
      SELECT id FROM source_strings WHERE documentId = ?
    );
  `);

  private readonly insertHistoryEventStatement = this.db.prepare(`
    INSERT INTO string_history (
      sourceStringId,
      languageCode,
      eventType,
      value,
      userId
    )
    VALUES (?, ?, ?, ?, ?);
  `);

  private readonly getDocumentStringByKeyStatement = this.db.prepare(`
    SELECT
      source_strings.value,
      (
        SELECT
        JSON_GROUP_ARRAY(
          JSON_OBJECT('fieldName', fieldName, 'value', value, 'uiHidden', uiHidden)
        )
        FROM source_string_additional_fields
        WHERE
          sourceStringId = source_strings.id
          AND
          source_strings.softDeleted = FALSE
      ) AS additionalFields
    FROM source_strings
    WHERE
      source_strings.documentId = ?
      AND
      source_strings.key = ?
    ;
  `);

  private readonly upsertSourceStringStatement = this.db.prepare(`
    INSERT INTO source_strings (documentId, key, value, stringOrder)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (documentId, key)
    DO UPDATE SET
      value = EXCLUDED.value,
      valueLastUpdatedDate = IIF(
        value = EXCLUDED.value,
        valueLastUpdatedDate,
        STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')
      ),
      softDeleted = FALSE,
      stringOrder = EXCLUDED.stringOrder
    RETURNING id;
  `);

  private readonly upsertAdditionalFieldStatement = this.db.prepare(`
    INSERT INTO source_string_additional_fields (sourceStringId, fieldName, value, uiHidden)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (sourceStringId, fieldName)
    DO UPDATE SET
      value = EXCLUDED.value,
      uiHidden = EXCLUDED.uiHidden,
      softDeleted = FALSE
    ;
  `);

  private readonly upsertTranslationStatement = this.db.prepare(`
    INSERT INTO translated_strings (sourceStringId, languageCode, value)
    VALUES (?, ?, ?)
    ON CONFLICT (sourceStringId, languageCode)
    DO UPDATE SET
      value = EXCLUDED.value,
      valueLastUpdatedDate = STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')
    ;
  `);

  private readonly getSourceStringsDocumentStatement = this.db.prepare(`
    SELECT
      source_strings.key,
      source_strings.value,
      (
        SELECT
        JSON_GROUP_ARRAY(
          JSON_OBJECT('fieldName', fieldName, 'value', value, 'uiHidden', uiHidden)
        )
        FROM source_string_additional_fields
        WHERE
          sourceStringId = source_strings.id
          AND
          source_strings.softDeleted = FALSE
      ) AS additionalFields
    FROM source_strings
    JOIN documents
    ON documents.id = source_strings.documentId
    WHERE documents.name = ?
    AND source_strings.softDeleted = FALSE
    ORDER BY source_strings.stringOrder ASC;
  `);

  private readonly getTranslatedStringsDocumentStatement = this.db.prepare(`
    SELECT
      source_strings.key,
      translated_strings.value
    FROM translated_strings
    INNER JOIN source_strings
    ON source_strings.id = translated_strings.sourceStringId
    INNER JOIN documents
    ON documents.id = source_strings.documentId
    WHERE
      translated_strings.languageCode = ?
      AND
      documents.name = ?
      AND
      source_strings.softDeleted = FALSE
    ORDER BY source_strings.stringOrder ASC;
  `);

  private readonly getStringsNeedingTranslationStatement = this.db.prepare(`
    SELECT
      source_strings.id,
      source_strings.key,
      source_strings.value,
      (
        SELECT
        JSON_GROUP_ARRAY(
          JSON_OBJECT('fieldName', fieldName, 'value', value, 'uiHidden', uiHidden)
        )
        FROM source_string_additional_fields
        WHERE
          sourceStringId = source_strings.id
          AND
          source_strings.softDeleted = FALSE
      ) AS additionalFields
    FROM source_strings
    LEFT JOIN translated_strings
    ON
      translated_strings.sourceStringId = source_strings.id
      AND
      translated_strings.languageCode = @languageCode
    WHERE
      source_strings.softDeleted = FALSE
      AND
      (
        translated_strings.id IS NULL
        OR
        translated_strings.valueLastUpdatedDate < source_strings.valueLastUpdatedDate
      )
      AND
      (
        @sourceStringIdOffset IS NULL
        OR
        source_strings.id < @sourceStringIdOffset
      )
    ORDER BY source_strings.valueLastUpdatedDate DESC, source_strings.id DESC
    LIMIT IIF(@limit IS NULL, 100, @limit);
  `);

  private readonly getTranslatedStringsStatement = this.db.prepare(`
    SELECT
      source_strings.id,
      source_strings.key,
      translated_strings.value,
      (
        SELECT
        JSON_GROUP_ARRAY(
          JSON_OBJECT('fieldName', fieldName, 'value', value, 'uiHidden', uiHidden)
        )
        FROM source_string_additional_fields
        WHERE
          sourceStringId = source_strings.id
          AND
          source_strings.softDeleted = FALSE
      ) AS additionalFields
    FROM source_strings
    LEFT JOIN translated_strings
    ON translated_strings.sourceStringId = source_strings.id
    WHERE
      languageCode = @languageCode
      AND
      source_strings.softDeleted = FALSE
      AND
      translated_strings.valueLastUpdatedDate >= source_strings.valueLastUpdatedDate
      AND 
      (
        @sourceStringIdOffset IS NULL
        OR
        source_strings.id < @sourceStringIdOffset
      )
    ORDER BY translated_strings.valueLastUpdatedDate DESC, source_strings.id DESC
    LIMIT IIF(@limit IS NULL, 100, @limit);
  `);

  private readonly getUserByApiKeyStatement = this.db.prepare(`
    SELECT
    *,
    (
      SELECT JSON_GROUP_ARRAY(languageCode)
      FROM user_languages
      WHERE user_languages.userId = users.id
    ) AS languageCodes
    FROM users
    WHERE apiKey = ?;
  `);

  private readonly getUserByUsernameStatement = this.db.prepare(`
    SELECT
    *,
    (
      SELECT JSON_GROUP_ARRAY(languageCode)
      FROM user_languages
      WHERE user_languages.userId = users.id
    ) AS languageCodes
    FROM users
    WHERE username = ?;
  `);

  private readonly getHistoryStatement = this.db.prepare(`
    SELECT
      users.username AS username,
      source_strings.value AS sourceValue,
      documents.name AS documentName,
      string_history.languageCode AS languageCode,
      string_history.eventType AS eventType,
      string_history.value AS value,
      string_history.eventDate AS eventDate
    FROM string_history
    JOIN users ON users.id = string_history.userId
    JOIN source_strings ON source_strings.id = string_history.sourceStringId
    JOIN documents ON documents.id = source_strings.documentId
    WHERE
      (@sourceStringId IS NULL OR source_strings.id = @sourceStringId)
      AND
      (
        @languageCode IS NULL
        OR
        (
          string_history.languageCode = @languageCode
          OR
          string_history.languageCode = 'source'
        )
      )
      AND
      (@historyIdOffset IS NULL OR string_history.id < @historyIdOffset)
    ORDER BY string_history.id DESC
    LIMIT IIF(@limit IS NULL, 100, @limit);
  `);

  private readonly deleteUserLanguagesStatement = this.db.prepare(`DELETE FROM user_languages WHERE userId = ?;`);
  private readonly getDocumentNamesStatement = this.db.prepare('SELECT name FROM documents;');
  private readonly getLanguageCodesStatement = this.db.prepare('SELECT DISTINCT languageCode FROM translated_strings;');
  private readonly getAdminUserStatement = this.db.prepare(`SELECT * FROM users WHERE role = '${Role.ADMIN}' LIMIT 1;`);
  private readonly deleteDocumentStatement = this.db.prepare('DELETE FROM documents WHERE name = ?;');
  private readonly moveDocumentStatement = this.db.prepare('UPDATE documents SET name = ? WHERE name = ?;');

  /* IMPLEMENTATION */

  constructor(
    databaseFilePath: string,
    private readonly db = betterSqlite3(databaseFilePath),
  ) {
  }

  close() {
    this.db.close();
  }

  getSensitiveUser(username: string): Promise<ISensitiveUser | undefined> {
    const user = this.getUserByUsernameStatement.get(username) as IRawUser;
    if (!user) {
      return Promise.resolve(undefined);
    }

    return Promise.resolve(parseRawDBUser(user));
  }

  getUserByApiKey(apiKey: string): Promise<IPublicUser | undefined> {
    const user = this.getUserByApiKeyStatement.get(apiKey);
    if (!user) {
      return Promise.resolve(undefined);
    }

    return Promise.resolve(parseRawDBUser(user));
  }

  async createUser(username: string, passwordHash: string, role: Role, apiKey: string, languageCodes: string[]): Promise<ISensitiveUser> {
    const existingUser = this.getUserByUsernameStatement.get(username) as IRawUser;

    if (existingUser) {
      throw new ConflictError('USER_EXISTS', 'A user with that username already exists');
    }

    const { id } = this.createUserStatement.get(username, passwordHash, role, apiKey) as IRawUser;

    this.db.transaction(() => {
      for (const languageCode of languageCodes) {
        this.insertUserLanguageCodeStatement.run(id, languageCode);
      }
    })();

    const sensitiveUser = await this.getSensitiveUser(username);
    assert(sensitiveUser);
    return sensitiveUser;
  }

  async updateUserPassword(username: string, passwordHash: string): Promise<ISensitiveUser> {
    const existingUser = this.getUserByUsernameStatement.get(username) as IRawUser;

    if (!existingUser) {
      throw new NotFoundError('USER_NOT_FOUND', 'A user with that username does not exist');
    }

    this.setUserPasswordStatement.run(passwordHash, existingUser.id);
    const sensitiveUser = await this.getSensitiveUser(username);
    assert(sensitiveUser);
    return sensitiveUser;
  }

  async updateUserApiKey(username: string, apiKey: string): Promise<ISensitiveUser> {
    const existingUser = this.getUserByUsernameStatement.get(username) as IRawUser;

    if (!existingUser) {
      throw new NotFoundError('USER_NOT_FOUND', 'A user with that username does not exist');
    }

    this.setUserApiKeyStatement.run(apiKey, existingUser.id);
    const sensitiveUser = await this.getSensitiveUser(username);
    assert(sensitiveUser);
    return sensitiveUser;
  }

  async updateUserLanguages(username: string, languageCodes: string[]): Promise<ISensitiveUser> {
    const existingUser = this.getUserByUsernameStatement.get(username) as IRawUser;

    if (!existingUser) {
      throw new NotFoundError('USER_NOT_FOUND', 'A user with that username does not exist');
    }

   this.db.transaction(() => {
      this.deleteUserLanguagesStatement.run(existingUser.id);

      for (const languageCode of languageCodes) {
        this.insertUserLanguageCodeStatement.run(existingUser.id, languageCode);
      }
    })();

    const sensitiveUser = await this.getSensitiveUser(username);
    assert(sensitiveUser);
    return sensitiveUser;
  }

  updateSourceStrings(userId: number, documentName: string, sourceStrings: Array<ISourceString>) {
    const stringsWithOrder = sourceStrings.map((sourceString, index) => ({ ...sourceString, order: index }));
    const { id: documentId } = this.upsertDocumentStatement.get(documentName);

    this.db.transaction(() => {
      this.softDeleteDocumentSourceStringAdditionalFieldsStatement.run(documentId);
      this.softDeleteDocumentSourceStringsStatement.run(documentId);

      for (const sourceString of stringsWithOrder) {
        const existingSourceString = this.getDocumentStringByKeyStatement.get(documentId, sourceString.key);

        const { id: sourceStringId } = this.upsertSourceStringStatement.get(
          documentId,
          sourceString.key,
          sourceString.value,
          sourceString.order,
        );

        for (const additionalField of sourceString.additionalFields ?? []) {
          this.upsertAdditionalFieldStatement.run(
            sourceStringId,
            additionalField.fieldName,
            additionalField.value,
            additionalField.uiHidden ? 1 : 0,
          );
        }

        if (!existingSourceString || existingSourceString.value !== sourceString.value) {
          this.insertHistoryEventStatement.run(sourceStringId, 'source', 'newValue', sourceString.value, userId);
        }
      }
    })();

    return Promise.resolve();
  }

  getStrings(documentName: string, languageCode: string): Promise<ITranslatedDocument | ISourceDocument> {
    const results = languageCode === 'source'
      ? this.getSourceStringsDocumentStatement.all(documentName)
      : this.getTranslatedStringsDocumentStatement.all(languageCode, documentName);

    return Promise.resolve(results.map(r => parseRawDBString(r)) as ITranslatedDocument | ISourceDocument);
  }

  getDocuments() {
    return Promise.resolve(this.getDocumentNamesStatement.all());
  }

  getLanguageCodes() {
    return Promise.resolve(this.getLanguageCodesStatement.all());
  }

  updateTranslation(sourceStringId: number, languageCode: string, value: string, userId: number) {
    this.db.transaction(() => {
      this.upsertTranslationStatement.run(sourceStringId, languageCode, value);
      this.insertHistoryEventStatement.run(sourceStringId, languageCode, 'newValue', value, userId);
    })();

    return Promise.resolve();
  }

  getStringsNeedingTranslation(languageCode: string, limit?: number, sourceStringIdOffset?: number): Promise<Array<ISourceString & { id: number }>> {
    const results = this.getStringsNeedingTranslationStatement.all({ languageCode, sourceStringIdOffset, limit });
    return Promise.resolve(
      results.map((r) => parseRawDBString(r)) as any
    );
  }

  getTranslatedStrings(languageCode: string, limit?: number, sourceStringIdOffset?: number): Promise<Array<ISourceString & { id: number }>> {
    const results = this.getTranslatedStringsStatement.all({ languageCode, sourceStringIdOffset, limit });
    return Promise.resolve(
      results.map((r) => parseRawDBString(r)) as any
    );
  }

  adminUserExists() {
    return Promise.resolve(Boolean(this.getAdminUserStatement.get()));
  }

  getStringHistory(options: { limit?: number | undefined; sourceStringId?: number | undefined; languageCode?: string | undefined; historyIdOffset?: number | undefined } = {}): Promise<IStringHistory[]> {
    const { sourceStringId, languageCode, historyIdOffset, limit } = options;

    return Promise.resolve(
      this.getHistoryStatement.all({
        sourceStringId,
        limit,
        languageCode,
        historyIdOffset
      }),
    );
  }

  moveDocument(fromName: string, toName: string) {
    const existingDocuments = this.getDocumentNamesStatement.all();
    
    if (existingDocuments.some(d => d.name === toName)) {
      throw new ConflictError('DOCUMENT_EXISTS', 'A document with the target name already exists.');
    }

    if (!existingDocuments.some(d => d.name === fromName)) {
      throw new NotFoundError('DOCUMENT_NOT_FOUND', 'A document with the source name does not exist.');
    }

    this.moveDocumentStatement.run(toName, fromName);
    return Promise.resolve();
  }

  deleteDocument(documentName: string) {
    const existingDocuments = this.getDocumentNamesStatement.all();

    if (!existingDocuments.some(d => d.name === documentName)) {
      throw new NotFoundError('DOCUMENT_NOT_FOUND', 'A document with the source name does not exist.');
    }

    this.deleteDocumentStatement.run(documentName);
    return Promise.resolve();
  }
}

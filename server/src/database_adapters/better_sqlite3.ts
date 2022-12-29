import _omitBy from 'lodash.omitby';
import { IDatabaseAdapter } from "../types/database_adapter";
import { Role } from "../types/roles";
import betterSqlite3 from "better-sqlite3";
import { IUser } from "../types/user";
import { ConflictError, NotFoundError } from '../types/errors';

export class BetterSQLite3Database implements IDatabaseAdapter {

  /* TABLES */

  // @ts-expect-error
  private readonly createUsersTableResult = this.db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      passwordSalt TEXT NOT NULL,
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
      name TEXT NOT NULL UNIQUE,
      softDeleted INTEGER NOT NULL DEFAULT FALSE
    );
  `);

  // @ts-expect-error
  private readonly createSourceStringsTableResult = this.db.exec(`
    CREATE TABLE IF NOT EXISTS source_strings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      documentId INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      comment TEXT,
      valueLastUpdatedDate DATETIME NOT NULL DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')),
      softDeleted INTEGER NOT NULL DEFAULT FALSE,
      stringOrder INTEGER NOT NULL,
      FOREIGN KEY (documentId) REFERENCES documents(id),
      UNIQUE (documentId, key)
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
      FOREIGN KEY (sourceStringId) REFERENCES source_strings(id),
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
      FOREIGN KEY (sourceStringId) REFERENCES source_strings(id),
      FOREIGN KEY (userId) REFERENCES users(id)
    );
  `);

  /* QUERIES */

  private readonly createUserStatement = this.db.prepare(`
    INSERT INTO users (username, passwordSalt, passwordHash, role, apiKey)
    VALUES (?, ?, ?, ?, ?)
    RETURNING id;
  `);

  private readonly insertUserLanguageCodeStatement = this.db.prepare(`
    INSERT INTO user_languages (userId, languageCode)
    VALUES (?, ?);
  `);

  private readonly setUserPasswordStatement = this.db.prepare(`
    UPDATE users
    SET
      passwordSalt = ?,
      passwordHash = ?
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
    ON CONFLICT (name) DO UPDATE SET
      name = EXCLUDED.name,
      softDeleted = FALSE
    RETURNING id;
  `);

  private readonly softDeleteDocumentSourceStringsStatement = this.db.prepare(`
    UPDATE source_strings
    SET softDeleted = TRUE
    WHERE documentId = (
      SELECT id FROM documents WHERE name = ?
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
      source_strings.comment
    FROM source_strings
    WHERE
      source_strings.documentId = ?
      AND
      source_strings.key = ?
    ;
  `);

  private readonly upsertSourceStringStatement = this.db.prepare(`
    INSERT INTO source_strings (documentId, key, value, comment, stringOrder)
    VALUES (
      (SELECT id FROM documents WHERE name = ?),
      ?,
      ?,
      ?,
      ?
    )
    ON CONFLICT (documentId, key)
    DO UPDATE SET
      value = EXCLUDED.value,
      valueLastUpdatedDate = IIF(
        value = EXCLUDED.value,
        valueLastUpdatedDate,
        STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')
      ),
      comment = EXCLUDED.comment,
      softDeleted = FALSE,
      stringOrder = EXCLUDED.stringOrder
    RETURNING id;
  `);

  private readonly upsertTranslationStatement = this.db.prepare(`
    INSERT INTO translated_strings (sourceStringId, languageCode, value)
    VALUES (?, ?, ?)
    ON CONFLICT (sourceStringId, languageCode)
    DO UPDATE SET
      value = EXCLUDED.value,
      valueLastUpdatedDate = IIF(
        value = EXCLUDED.value,
        valueLastUpdatedDate,
        STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')
      )
    ;
  `);

  private readonly getSourceStringsDocumentStatement = this.db.prepare(`
    SELECT
      source_strings.key,
      source_strings.value,
      source_strings.comment
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
      source_strings.comment
    FROM source_strings
    JOIN documents
    ON documents.id = source_strings.documentId
    LEFT JOIN translated_strings
    ON
      translated_strings.sourceStringId = source_strings.id
      AND
      translated_strings.languageCode = @languageCode
    WHERE
      source_strings.softDeleted = FALSE
      AND
      documents.softDeleted = FALSE
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
    ORDER BY source_strings.id DESC
    LIMIT @limit;
  `);

  private readonly getTranslatedStringsStatement = this.db.prepare(`
    SELECT
      source_strings.id,
      source_strings.key,
      translated_strings.value,
      source_strings.comment
    FROM source_strings
    INNER JOIN documents
    ON documents.id = source_strings.documentId
    LEFT JOIN translated_strings
    ON translated_strings.sourceStringId = source_strings.id
    WHERE
      languageCode = @languageCode
      AND
      source_strings.softDeleted = FALSE
      AND
      documents.softDeleted = FALSE
      AND
      translated_strings.valueLastUpdatedDate >= source_strings.valueLastUpdatedDate
      AND 
      (
        @sourceStringIdOffset IS NULL
        OR
        source_strings.id < @sourceStringIdOffset
      )
    ORDER BY source_strings.id DESC
    LIMIT @limit;
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

  private readonly deleteUserLanguagesStatement = this.db.prepare(`DELETE FROM user_languages WHERE userId = ?;`);
  private readonly getDocumentNamesStatement = this.db.prepare('SELECT name FROM documents WHERE softDeleted = FALSE;');
  private readonly getLanguageCodesStatement = this.db.prepare('SELECT DISTINCT languageCode FROM user_languages;');
  private readonly adminUserQuery = this.db.prepare('SELECT * FROM users WHERE role = \'admin\' LIMIT 1;');

  /* IMPLEMENTATION */

  constructor(
    databaseFilePath: string,
    private readonly db = betterSqlite3(databaseFilePath),
  ) {
  }

  close() {
    this.db.close();
  }

  getUserSecretsForPasswordLogin(username: string): Promise<{
    passwordSalt: string;
    passwordHash: string;
    apiKey: string;
  } | undefined> {
    const user = this.getUserByUsernameStatement.get(username);
    if (!user) {
      return Promise.resolve(undefined);
    }

    return Promise.resolve(user);
  }

  getUserByApiKey(apiKey: string): Promise<IUser | undefined> {
    const user = this.getUserByApiKeyStatement.get(apiKey);
    if (!user) {
      return Promise.resolve(undefined);
    }

    return Promise.resolve({
      id: user.id,
      username: user.username,
      role: user.role,
      languageCodes: JSON.parse(user.languageCodes),
    });
  }

  createUser(username: string, passwordSalt: string, passwordHash: string, role: Role, apiKey: string, languageCodes: string[]) {
    const existingUser = this.getUserByUsernameStatement.get(username);

    if (existingUser) {
      throw new ConflictError('USER_EXISTS', 'A user with that username already exists');
    }

    const { id } = this.createUserStatement.get(username, passwordSalt, passwordHash, role, apiKey);

    return this.db.transaction(() => {
      for (const languageCode of languageCodes) {
        this.insertUserLanguageCodeStatement.run(id, languageCode);
      }

      return Promise.resolve(id);
    })();
  }

  updateUserPassword(username: string, passwordSalt: string, passwordHash: string) {
    const existingUser = this.getUserByUsernameStatement.get(username);

    if (!existingUser) {
      throw new NotFoundError('USER_NOT_FOUND', 'A user with that username does not exist');
    }

    this.setUserPasswordStatement.run(passwordSalt, passwordHash, existingUser.id);
    return Promise.resolve();
  }

  updateUserApiKey(username: string, apiKey: string) {
    const existingUser = this.getUserByUsernameStatement.get(username);

    if (!existingUser) {
      throw new NotFoundError('USER_NOT_FOUND', 'A user with that username does not exist');
    }

    this.setUserApiKeyStatement.run(apiKey, existingUser.id);
    return Promise.resolve();
  }

  updateUserLanguages(username: string, languageCodes: string[]) {
    const existingUser = this.getUserByUsernameStatement.get(username);

    if (!existingUser) {
      throw new NotFoundError('USER_NOT_FOUND', 'A user with that username does not exist');
    }

    return this.db.transaction(() => {
      this.deleteUserLanguagesStatement.run(existingUser.id);

      for (const languageCode of languageCodes) {
        this.insertUserLanguageCodeStatement.run(existingUser.id, languageCode);
      }

      return Promise.resolve();
    })();
  }

  upsertSourceStrings(username: string, documentName: string, sourceStrings: Array<{ key: string; value: string; comment?: string; }>) {
    const stringsWithOrder = sourceStrings.map((sourceString, index) => ({ ...sourceString, order: index }));
    const user = this.getUserByUsernameStatement.get(username);

    this.db.transaction(() => {
      const { id: documentId } = this.upsertDocumentStatement.get(documentName);
      this.softDeleteDocumentSourceStringsStatement.run(documentName);

      for (const sourceString of stringsWithOrder) {
        const existingSourceString = this.getDocumentStringByKeyStatement.get(documentId, sourceString.key);

        const { id: sourceStringId } = this.upsertSourceStringStatement.get(
          documentName,
          sourceString.key,
          sourceString.value,
          sourceString.comment,
          sourceString.order,
        );

        if (!existingSourceString || existingSourceString.value !== sourceString.value) {
          this.insertHistoryEventStatement.run(sourceStringId, 'source', 'newValue', sourceString.value, user?.id);
        } else if (existingSourceString.comment !== (sourceString.comment ?? null)) {
          this.insertHistoryEventStatement.run(sourceStringId, 'source', 'commentChanged', sourceString.comment, user?.id);
        }
      }
    })();
  }

  getStrings(documentName: string, languageCode: string) {
    const results = languageCode === 'source'
      ? this.getSourceStringsDocumentStatement.all(documentName)
      : this.getTranslatedStringsDocumentStatement.all(languageCode, documentName);

    return results.map(r => _omitBy(r, v => v === null));
  }

  getDocuments() {
    return this.getDocumentNamesStatement.all();
  }

  getLanguageCodes() {
    return this.getLanguageCodesStatement.all();
  }

  addTranslation(sourceStringId: number, languageCode: string, value: string, createdBy: string) {
    const user = this.getUserByUsernameStatement.get(createdBy);

    this.db.transaction(() => {
      this.upsertTranslationStatement.run(sourceStringId, languageCode, value);
      this.insertHistoryEventStatement.run(sourceStringId, languageCode, 'newValue', value, user.id);
    })();
  }

  getStringsNeedingTranslation(languageCode: string, limit: number, sourceStringIdOffset?: number): Promise<Array<{
    id: number;
    key: string;
    value: string;
    comment?: string;
  }>> {
    const results = this.getStringsNeedingTranslationStatement.all({ languageCode, sourceStringIdOffset, limit });
    return Promise.resolve(
      results.map((r) => _omitBy(r, (v) => v === null)) as any
    );
  }

  getTranslatedStrings(languageCode: string, limit: number, sourceStringIdOffset?: number) {
    return this.getTranslatedStringsStatement.all({ languageCode, sourceStringIdOffset, limit });
  }

  adminUserExists() {
    return Boolean(this.adminUserQuery.get());
  }
}

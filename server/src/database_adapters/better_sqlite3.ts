import { IDatabaseAdapter } from "../types/database_adapter";
import { Role } from "../types/roles";
import betterSqlite3 from "better-sqlite3";

export class BetterSQLite3Database implements IDatabaseAdapter {

  /* TABLES */

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

  private readonly createTranslatorLanguageTableResult = this.db.exec(`
    CREATE TABLE IF NOT EXISTS user_languages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      userId INTEGER NOT NULL,
      languageCode TEXT NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id),
      UNIQUE (userId, languageCode)
    );
  `);

  private readonly createDocumentsTableResult = this.db.exec(`
    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      softDeleted INTEGER NOT NULL DEFAULT FALSE
    );
  `);

  private readonly createSourceStringsTableResult = this.db.exec(`
    CREATE TABLE IF NOT EXISTS source_strings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      documentId INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      comment TEXT,
      valueLastUpdatedDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      softDeleted INTEGER NOT NULL DEFAULT FALSE,
      FOREIGN KEY (documentId) REFERENCES documents(id),
      UNIQUE (documentId, key)
    );
  `);

  private readonly createTranslatedStringsTableResult = this.db.exec(`
    CREATE TABLE IF NOT EXISTS translated_strings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sourceStringId INTEGER NOT NULL,
      languageCode TEXT NOT NULL,
      value TEXT NOT NULL,
      createdDate DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      createdBy INTEGER NOT NULL,
      FOREIGN KEY (sourceStringId) REFERENCES source_strings(id),
      FOREIGN KEY (createdBy) REFERENCES users(id)
    );
  `);

  /* QUERIES */

  private readonly createUserStatement = this.db.prepare(`
    INSERT INTO users (username, password, role, apiKey)
    VALUES (?, ?, ?, ?);
  `);

  private readonly insertUserLanguageCodeStatement = this.db.prepare(`
    INSERT INTO user_languages (userId, languageCode)
    VALUES (
      SELECT id FROM users WHERE username = ?,
      ?
    );
  `);

  private readonly setUserPasswordStatement = this.db.prepare(`
    UPDATE users
    SET passwordSalt = ?, passwordHash = ?
    WHERE username = ?;
  `);

  private readonly setUserApiKeyStatement = this.db.prepare(`
    UPDATE users
    SET apiKey = ?
    WHERE username = ?;
  `);

  private readonly upsertDocumentStatement = this.db.prepare(`
    INSERT INTO documents (name)
    VALUES (?)
    ON CONFLICT (name) DO UPDATE SET
      name = EXCLUDED.name,
      softDeleted = FALSE
    ;
  `);

  private readonly upsertSourceStringStatement = this.db.prepare(`
    INSERT INTO source_strings (documentId, key, value, comment)
    VALUES (
      SELECT id FROM documents WHERE name = ?,
      ?,
      ?,
      ?
    )
    ON CONFLICT (documentId, key)
    DO UPDATE SET
      value = EXCLUDED.value,
      valueLastUpdatedDate = IIF(value = EXCLUDED.value, valueLastUpdatedDate, CURRENT_TIMESTAMP),
      comment = EXCLUDED.comment,
      softDeleted = FALSE
    ;
  `);

  private readonly getSourceStringsDocumentStatement = this.db.prepare(`
    SELECT
      source_strings.key,
      source_strings.value,
      source_strings.comment
    FROM source_strings
    WHERE source_strings.documentId = (
      SELECT id FROM documents WHERE name = ?
    )
    AND source_strings.softDeleted = FALSE;
  `);

  private readonly getTranslatedStringsDocumentStatement = this.db.prepare(`
    WITH most_recent_tx_id_per_source_string AS (
      SELECT sourceStringId, MAX(translated_strings.id) AS translatedStringId
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
      GROUP BY sourceStringId
    )
    SELECT
      source_strings.key,
      translated_strings.value
      source_strings.comment
    FROM source_strings
    INNER JOIN translated_strings
    ON translated_strings.sourceStringId = source_strings.id
    INNER JOIN most_recent_tx_id_per_source_string
    ON
      most_recent_tx_id_per_source_string.sourceStringId = source_strings.id
      AND
      most_recent_tx_id_per_source_string.translatedStringId = translated_strings.id;
  `);

  private readonly addTranslationStatement = this.db.prepare(`
    INSERT INTO translated_strings (sourceStringId, languageCode, value, createdBy)
    VALUES (?, ?, ?, ?);
  `);

  private readonly getStringsNeedingTranslationStatement = this.db.prepare(`
    SELECT
      source_strings.id,
      source_strings.key,
      source_strings.value,
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
    GROUP BY source_strings.id
    ORDER BY source_strings.id DESC
    HAVING(
      (
        MAX(translated_strings.createdDate) < source_strings.valueLastUpdatedDate
        OR
        MAX(translated_strings.createdDate) IS NULL
      )
      AND
      (
        @sourceStringIdOffset IS NULL
        OR
        source_strings.id < @sourceStringIdOffset
      )
    )
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
    GROUP BY source_strings.id
    ORDER BY source_strings.id DESC
    HAVING(
      MAX(translated_strings.createdDate) > source_strings.valueLastUpdatedDate
      AND
      (
        @sourceStringIdOffset IS NULL
        OR
        source_strings.id < @sourceStringIdOffset
      )
    )
    LIMIT @limit;
  `);

  private readonly getTranslationHistoryStatement = this.db.prepare(`
    SELECT
      translated_strings.createdDate,
      translated_strings.value,
      users.username
    FROM translated_strings
    INNER JOIN users
    ON users.id = translated_strings.createdBy
    WHERE
      translated_strings.sourceStringId = @sourceStringId
      AND
      translated_strings.languageCode = @languageCode
    ORDER BY translated_strings.createdDate DESC
    LIMIT @limit;
  `);

  private readonly deleteUserLanguagesStatement = this.db.prepare(`DELETE FROM user_languages WHERE userId = (SELECT id FROM users WHERE username = ?);`);
  private readonly getDocumentNamesStatement = this.db.prepare('SELECT name FROM documents WHERE softDeleted = FALSE;');
  private readonly getLanguageCodesStatement = this.db.prepare('SELECT DISTINCT languageCode FROM user_languages;');
  private readonly adminUserQuery = this.db.prepare('SELECT * FROM users WHERE role = \'admin\';');

  /* IMPLEMENTATION */

  constructor(
    databaseFilePath: string,
    private readonly db = betterSqlite3(databaseFilePath),
  ) {
  }

  createUser(username: string, passwordSalt: string, passwordHash: string, role: Role, apiKey: string, languageCodes: string[]) {
    return this.db.transaction(() => {
      const user = this.createUserStatement.run(username, passwordSalt, passwordHash, role, apiKey);
      for (const languageCode of languageCodes) {
        this.insertUserLanguageCodeStatement.run(username, languageCode);
      }

      return Promise.resolve(Number(user.lastInsertRowid));
    })();
  }

  updateUserPassword(username: string, passwordSalt: string, passwordHash: string) {
    this.setUserPasswordStatement.run(passwordSalt, passwordHash, username);
    return Promise.resolve();
  }

  updateUserApiKey(username: string, apiKey: string) {
    this.setUserApiKeyStatement.run(apiKey, username);
    return Promise.resolve();
  }

  updateUserLanguages(username: string, languageCodes: string[]) {
    return this.db.transaction(() => {
      this.deleteUserLanguagesStatement.run(username);

      for (const languageCode of languageCodes) {
        this.insertUserLanguageCodeStatement.run(username, languageCode);
      }

      return Promise.resolve();
    })();
  }

  upsertSourceStrings(documentName: string, sourceStrings: Array<{ key: string; value: string; comment?: string; }>) {
    this.upsertDocumentStatement.run(documentName);

    for (const sourceString of sourceStrings) {
      this.upsertSourceStringStatement.run(documentName, sourceString.key, sourceString.value, sourceString.comment);
    }
  }

  getStrings(documentName: string, languageCode: string) {
    if (languageCode === 'source') {
      return this.getSourceStringsDocumentStatement.all(documentName);
    }

    return this.getTranslatedStringsDocumentStatement.all(languageCode, documentName);
  }

  getDocuments() {
    return this.getDocumentNamesStatement.all();
  }

  getLanguageCodes() {
    return this.getLanguageCodesStatement.all();
  }

  addTranslation(sourceStringId: number, languageCode: string, value: string, createdBy: number) {
    this.addTranslationStatement.run(sourceStringId, languageCode, value, createdBy);
  }

  getStringsNeedingTranslation(languageCode: string, limit: number, sourceStringIdOffset?: number) {
    return this.getStringsNeedingTranslationStatement.all({ languageCode, sourceStringIdOffset, limit });
  }

  getTranslatedStrings(languageCode: string, limit: number, sourceStringIdOffset?: number) {
    return this.getTranslatedStringsStatement.all({ languageCode, sourceStringIdOffset, limit });
  }

  getTranslationHistory(sourceStringId: number, languageCode: string, limit: number) {
    return this.getTranslationHistoryStatement.all({ sourceStringId, languageCode, limit });
  }

  adminUserExists() {
    return Boolean(this.adminUserQuery.get());
  }
}

import _omit from 'lodash.omit';
import fs from 'fs';
import { Role } from '../types/enums';
import { BetterSQLite3Database } from './better_sqlite3';

let database: BetterSQLite3Database;

const defaultAdminUsername = 'admin';

function createDefaultAdmin() {
  return database.createUser(defaultAdminUsername, 'hash', Role.ADMIN, 'apikey', ['en']);
}

describe('Better-sqlite3 database tests', () => {
  const testDatabaseFilePath = './test.database.db';

  beforeEach(() => {
    try {
      if (database) {
        database.close();
      }

      fs.unlinkSync(testDatabaseFilePath);
    } catch (err) {
      if ((err as any)?.code !== 'ENOENT') {
        throw err;
      }
    }

    database = new BetterSQLite3Database(testDatabaseFilePath);
  });

  it('Returns nothing from getUsersByRole({ role: Role.ADMIN }) if no admin user exists', async () => {
    const result = await database.getUsers({ role: Role.ADMIN });
    expect(result).toHaveLength(0);
  });

  it('Can create an admin user and then returns that user from getUsersByRole(Role.ADMIN)', async () => {
    await createDefaultAdmin();
    const result = await database.getUsers({ role: Role.ADMIN });
    expect(result[0]?.username).toBe(defaultAdminUsername);
  });

  it('Can lookup a user by api key', async () => {
    await database.createUser('user1', 'hash', Role.TRANSLATOR, 'apikey1', ['en', 'fr']);
    await database.createUser('user2', 'hash', Role.TRANSLATOR, 'apikey2', ['de', 'no']);

    const result1 = await database.getUserByApiKey('apikey1');
    const result2 = await database.getUserByApiKey('apikey2');
    const noResult = await database.getUserByApiKey('apikey3');

    expect(result1?.username).toEqual('user1');
    expect(result2?.username).toEqual('user2');

    expect(result1?.languageCodes).toEqual(['en', 'fr']);
    expect(result2?.languageCodes).toEqual(['de', 'no']);

    expect(noResult).toBeUndefined();
  });

  it("Can update a user's API key", async () => {
    await database.createUser('user1', 'hash', Role.TRANSLATOR, 'apikey1', ['en', 'fr']);
    await database.updateUserApiKey('user1', 'xyz');

    const result1 = await database.getUserByApiKey('apikey1');
    const result2 = await database.getUserByApiKey('xyz');

    expect(result1).toBeUndefined();
    expect(result2?.username).toEqual('user1');
  });

  it("Can update a user's password", async () => {
    await database.createUser('user1', 'hash', Role.TRANSLATOR, 'apikey1', ['en', 'fr']);
    await database.updateUserPassword('user1', 'xyz');

    const result1 = await database.getUserByUsername('user1');

    expect(result1?.passwordHash).toEqual('xyz');
  });

  it("Can update a user's languages", async () => {
    await database.createUser('user1', 'hash', Role.TRANSLATOR, 'apikey1', ['en', 'fr']);
    await database.updateUserLanguages('user1', ['wz', 'xy']);

    const result1 = await database.getUserByApiKey('apikey1');

    expect(result1?.languageCodes).toEqual(['wz', 'xy']);
  });

  it('Can add a new document', async () => {
    await createDefaultAdmin();

    const strings = [
      { key: 'string1', value: 'String 1', additionalFields: [] },
      { key: 'string2', value: 'String 2', additionalFields: [] },
      {
        key: 'string3',
        value: 'String 2',
        additionalFields: [{ fieldName: 'Comment', value: 'Comment 3', uiHidden: false }],
      },
    ];

    await database.updateDocumentSourceStrings(1, 'testdocument', strings);
    const resultStrings = await database.getDocumentStrings('testdocument', 'source');

    expect(resultStrings).toEqual(strings);
  });

  it('Can upsert a document and overwrite strings', async () => {
    await createDefaultAdmin();

    const strings1 = [
      { key: 'string1', value: 'String 1', additionalFields: [] },
      { key: 'string2', value: 'String 2', additionalFields: [] },
      {
        key: 'string3',
        value: 'String 2',
        additionalFields: [{ fieldName: 'Comment', value: 'Comment 3' }],
      },
    ];

    const strings2 = [
      { key: 'string1', value: 'String 1', additionalFields: [] },
      { key: 'string2', value: 'String XYZ', additionalFields: [] },
    ];

    await database.updateDocumentSourceStrings(1, 'testdocument', strings1);
    await database.updateDocumentSourceStrings(1, 'testdocument', strings2);

    const resultStrings = await database.getDocumentStrings('testdocument', 'source');

    expect(resultStrings).toEqual(strings2);
  });

  it('Returns empty array if there are no translations', async () => {
    await createDefaultAdmin();

    const strings1 = [
      { key: 'string1', value: 'String 1' },
      { key: 'string2', value: 'String 2' },
      {
        key: 'string3',
        value: 'String 2',
        additionalFields: [{ fieldName: 'Comment', value: 'Comment 3' }],
      },
    ];

    await database.updateDocumentSourceStrings(1, 'testdocument', strings1);

    const resultStrings = await database.getDocumentStrings('testdocument', 'fr-FR');

    expect(resultStrings).toEqual([]);
  });

  it('Can get the strings that need translation', async () => {
    await createDefaultAdmin();

    const strings1 = [
      { key: 'string1', value: 'String 1', additionalFields: [] },
      { key: 'string2', value: 'String 2', additionalFields: [] },
      {
        key: 'string3',
        value: 'String 2',
        additionalFields: [{ fieldName: 'Comment', value: 'Comment 3', uiHidden: false }],
      },
    ];

    await database.updateDocumentSourceStrings(1, 'testdocument', strings1);

    const resultStrings = await database.getStringsNeedingTranslation('fr-FR', 100);

    expect(resultStrings.map((s) => _omit(s, 'id'))).toEqual(strings1.reverse());
  });

  it('Can translate a string', async () => {
    await createDefaultAdmin();

    const strings1 = [
      { key: 'string1', value: 'String 1' },
      { key: 'string2', value: 'String 2' },
      {
        key: 'string3',
        value: 'String 2',
        additionalFields: [{ fieldName: 'Comment', value: 'Comment 3' }],
      },
    ];

    await database.createUser('user1', 'hash', Role.TRANSLATOR, 'apikey1', ['en', 'fr']);
    await database.updateDocumentSourceStrings(1, 'testdocument', strings1);
    const resultStrings = await database.getStringsNeedingTranslation('fr-FR', 100);
    await database.updateTranslation(resultStrings[0]!['id'], 'fr-FR', 'String 1 FR', 2);
    const resultStrings2 = await database.getStringsNeedingTranslation('fr-FR', 100);

    expect(resultStrings2).toHaveLength(2);

    const translatedStrings = await database.getTranslatedStrings('fr-FR', 100);
    expect(translatedStrings).toHaveLength(1);
    expect(translatedStrings[0]!.id).toEqual(resultStrings[0]!['id']);
  });

  it('Can translate a string, have it overwritten by a new source, and then translate it again', async () => {
    await createDefaultAdmin();

    const initialSourceStrings = [
      { key: 'string1', value: 'String 1' },
      { key: 'string2', value: 'String 2' },
      {
        key: 'string3',
        value: 'String 3',
        additionalFields: [{ fieldName: 'Comment', value: 'Comment 3' }],
      },
    ];

    await database.updateDocumentSourceStrings(1, 'testdocument', initialSourceStrings);
    const initialStringsToTranslate = await database.getStringsNeedingTranslation('fr-FR', 100);

    const string1 = initialStringsToTranslate.find((s) => s.key === 'string1');
    const string2 = initialStringsToTranslate.find((s) => s.key === 'string2');
    await database.updateTranslation(string1!.id, 'fr-FR', 'String 1 FR', 1);
    await database.updateTranslation(string2!.id, 'fr-FR', 'String 2 FR', 1);

    expect(await database.getStringsNeedingTranslation('fr-FR', 100)).toHaveLength(1);

    const updatedSourceStrings = initialSourceStrings.map((s) =>
      s.key === 'string1' ? { ...s, value: 'String 1 Updated' } : s,
    );
    await database.updateDocumentSourceStrings(1, 'testdocument', updatedSourceStrings);

    const updatedStringsToTranslated = await database.getStringsNeedingTranslation('fr-FR', 100);
    expect(updatedStringsToTranslated).toHaveLength(2);

    const string1Updated = updatedStringsToTranslated.find((s) => s.key === 'string1');
    expect(string1Updated?.value).toEqual('String 1 Updated');

    await database.updateTranslation(string1!.id, 'fr-FR', 'String 1 Updated FR', 1);

    expect(await database.getStringsNeedingTranslation('fr-FR', 100)).toHaveLength(1);
    expect(await database.getTranslatedStrings('fr-FR', 100)).toHaveLength(2);

    const historyAll = await database.getStringHistory();
    const historyGerman = await database.getStringHistory({ languageCode: 'de-DE' });

    expect(historyAll).toHaveLength(7);
    expect(historyGerman).toHaveLength(4);
  });

  it('Can delete a document', async () => {
    await createDefaultAdmin();

    const strings1 = [
      { key: 'string1', value: 'String 1', additionalFields: [] },
      { key: 'string2', value: 'String 2', additionalFields: [] },
      { key: 'string3', value: 'String 2', additionalFields: [] },
    ];

    await database.updateDocumentSourceStrings(1, 'testdocument', strings1);
    const resultStrings1 = await database.getDocumentStrings('testdocument', 'source');
    await database.deleteDocument('testdocument');
    const resultStrings2 = await database.getDocumentStrings('testdocument', 'source');

    expect(resultStrings1).toEqual(strings1);
    expect(resultStrings2).toHaveLength(0);
  });

  it('Can move a document', async () => {
    await createDefaultAdmin();

    const strings1 = [
      { key: 'string1', value: 'String 1', additionalFields: [] },
      { key: 'string2', value: 'String 2', additionalFields: [] },
      { key: 'string3', value: 'String 2', additionalFields: [] },
    ];

    await database.updateDocumentSourceStrings(1, 'testdocument', strings1);
    await database.moveDocument('testdocument', 'testdocument2');
    const resultStrings1 = await database.getDocumentStrings('testdocument', 'source');
    const resultStrings2 = await database.getDocumentStrings('testdocument2', 'source');

    expect(resultStrings1).toHaveLength(0);
    expect(resultStrings2).toEqual(strings1);
  });
});

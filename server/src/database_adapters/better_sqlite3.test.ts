import _omit from 'lodash.omit';
import fs from 'fs';
import { Role } from '../types/roles';
import { BetterSQLite3Database } from './better_sqlite3';

let database: BetterSQLite3Database;

const defaultAdminUsername = 'admin';

function createDefaultAdmin() {
  return database.createUser(defaultAdminUsername, 'salt', 'hash', Role.ADMIN, 'apikey', ['en']);
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

  it('Returns false from adminUserExists() if no admin user exists', async () => {
    const result = await database.adminUserExists();
    expect(result).toBe(false);
  });

  it('Can create an admin user and then returns true from adminUserExists()', async () => {
    await createDefaultAdmin();
    const result = await database.adminUserExists();
    expect(result).toBe(true);
  });

  it('Can lookup a user by api key', async () => {
    await database.createUser('user1', 'salt', 'hash', Role.TRANSLATOR, 'apikey1', ['en', 'fr']);
    await database.createUser('user2', 'salt', 'hash', Role.TRANSLATOR, 'apikey2', ['de', 'no']);

    const result1 = await database.getUserByApiKey('apikey1');
    const result2 = await database.getUserByApiKey('apikey2');
    const noResult = await database.getUserByApiKey('apikey3');

    expect(result1?.username).toEqual('user1');
    expect(result2?.username).toEqual('user2');

    expect(result1?.languageCodes).toEqual(['en', 'fr']);
    expect(result2?.languageCodes).toEqual(['de', 'no']);

    expect(noResult).toBeUndefined();
  });

  it('Can update a user\'s API key', async () => {
    await database.createUser('user1', 'salt', 'hash', Role.TRANSLATOR, 'apikey1', ['en', 'fr']);
    await database.updateUserApiKey('user1', 'xyz');

    const result1 = await database.getUserByApiKey('apikey1');
    const result2 = await database.getUserByApiKey('xyz');

    expect(result1).toBeUndefined();
    expect(result2?.username).toEqual('user1');
  });

  it('Can update a user\'s password', async () => {
    await database.createUser('user1', 'salt', 'hash', Role.TRANSLATOR, 'apikey1', ['en', 'fr']);
    await database.updateUserPassword('user1', 'xyz', 'xyz');

    const result1 = await database.getUserSecretsForPasswordLogin('user1');

    expect(result1?.passwordHash).toEqual('xyz');
    expect(result1?.passwordSalt).toEqual('xyz');
  });

  it('Can update a user\'s languages', async () => {
    await database.createUser('user1', 'salt', 'hash', Role.TRANSLATOR, 'apikey1', ['en', 'fr']);
    await database.updateUserLanguages('user1', ['wz', 'xy']);

    const result1 = await database.getUserByApiKey('apikey1');

    expect(result1?.languageCodes).toEqual(['wz', 'xy']);
  });

  it('Can add a new document', async () => {
    await createDefaultAdmin();

    const strings = [
      { key: 'string1', value: 'String 1' },
      { key: 'string2', value: 'String 2' },
      { key: 'string3', value: 'String 2', comment: 'Comment 3' },
    ];

    await database.upsertSourceStrings(defaultAdminUsername, 'testdocument', strings);
    const resultStrings = await database.getStrings('testdocument', 'source');

    expect(resultStrings).toEqual(strings);
  });

  it('Can upsert a document and overwrite strings', async () => {
    await createDefaultAdmin();

    const strings1 = [
      { key: 'string1', value: 'String 1' },
      { key: 'string2', value: 'String 2' },
      { key: 'string3', value: 'String 2', comment: 'Comment 3' },
    ];

    const strings2 = [
      { key: 'string1', value: 'String 1' },
      { key: 'string2', value: 'String XYZ' },
    ];

    await database.upsertSourceStrings(defaultAdminUsername, 'testdocument', strings1);
    await database.upsertSourceStrings(defaultAdminUsername, 'testdocument', strings2);

    const resultStrings = await database.getStrings('testdocument', 'source');

    expect(resultStrings).toEqual(strings2);
  });

  it('Returns empty array if there are no translations', async () => {
    await createDefaultAdmin();

    const strings1 = [
      { key: 'string1', value: 'String 1' },
      { key: 'string2', value: 'String 2' },
      { key: 'string3', value: 'String 2', comment: 'Comment 3' },
    ];

    await database.upsertSourceStrings(defaultAdminUsername, 'testdocument', strings1);

    const resultStrings = await database.getStrings('testdocument', 'fr-FR');

    expect(resultStrings).toEqual([]);
  });

  it('Can get the strings that need translation', async () => {
    await createDefaultAdmin();

    const strings1 = [
      { key: 'string1', value: 'String 1' },
      { key: 'string2', value: 'String 2' },
      { key: 'string3', value: 'String 2', comment: 'Comment 3' },
    ];

    await database.upsertSourceStrings(defaultAdminUsername, 'testdocument', strings1);

    const resultStrings = await database.getStringsNeedingTranslation('fr-FR', 100);

    expect(resultStrings.map(s => _omit(s, 'id'))).toEqual(strings1.reverse());
  });

  it('Can translate a string', async () => {
    await createDefaultAdmin();

    const strings1 = [
      { key: 'string1', value: 'String 1' },
      { key: 'string2', value: 'String 2' },
      { key: 'string3', value: 'String 2', comment: 'Comment 3' },
    ];

    await database.createUser('user1', 'salt', 'hash', Role.TRANSLATOR, 'apikey1', ['en', 'fr']);
    await database.upsertSourceStrings(defaultAdminUsername, 'testdocument', strings1);
    const resultStrings = await database.getStringsNeedingTranslation('fr-FR', 100);
    await database.addTranslation(resultStrings[0]!['id'], 'fr-FR', 'String 1 FR', 'user1');
    const resultStrings2 = await database.getStringsNeedingTranslation('fr-FR', 100);

    expect(resultStrings2).toHaveLength(2);

    const translatedStrings = database.getTranslatedStrings('fr-FR', 100);
    expect(translatedStrings).toHaveLength(1);
    expect(translatedStrings[0].id).toEqual(resultStrings[0]!['id']);
  });

  it('Can translate a string, have it overwritten by a new source, and then translate it again', async () => {
    await createDefaultAdmin();

    const initialSourceStrings = [
      { key: 'string1', value: 'String 1' },
      { key: 'string2', value: 'String 2' },
      { key: 'string3', value: 'String 3', comment: 'Comment 3' },
    ];

    await database.upsertSourceStrings(defaultAdminUsername, 'testdocument', initialSourceStrings);
    const initialStringsToTranslate = await database.getStringsNeedingTranslation('fr-FR', 100);

    const string1 = initialStringsToTranslate.find(s => s.key === 'string1');
    const string2 = initialStringsToTranslate.find(s => s.key === 'string2');
    await database.addTranslation(string1!.id, 'fr-FR', 'String 1 FR', defaultAdminUsername);
    await database.addTranslation(string2!.id, 'fr-FR', 'String 2 FR', defaultAdminUsername);

    expect(await database.getStringsNeedingTranslation('fr-FR', 100)).toHaveLength(1);

    const updatedSourceStrings = initialSourceStrings.map((s) => s.key === 'string1' ? { ...s, value: 'String 1 Updated' } : s);
    await database.upsertSourceStrings(defaultAdminUsername, 'testdocument', updatedSourceStrings);

    const updatedStringsToTranslated = await database.getStringsNeedingTranslation('fr-FR', 100);
    expect(updatedStringsToTranslated).toHaveLength(2);

    const string1Updated = updatedStringsToTranslated.find(s => s.key === 'string1');
    expect(string1Updated?.value).toEqual('String 1 Updated');

    await database.addTranslation(string1!.id, 'fr-FR', 'String 1 Updated FR', defaultAdminUsername);

    expect(await database.getStringsNeedingTranslation('fr-FR', 100)).toHaveLength(1);
    expect(await database.getTranslatedStrings('fr-FR', 100)).toHaveLength(2);

    const historyAll = await database.getHistory();
    const historyGerman = await database.getHistory({ languageCode: 'de-DE' });

    expect(historyAll).toHaveLength(7);
    expect(historyGerman).toHaveLength(4);
  });
});

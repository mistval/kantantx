import assert from 'assert';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { IUpdateDocumentRequest } from './types/api_schemas/documents';
import {
  IGetStringsQuery,
  ISourceDocument,
  IUpdateTranslationBody,
} from './types/api_schemas/strings';
import { ICreateUserRequest, ILoginBody, IUpdateUserRequest } from './types/api_schemas/users';
import { IDatabaseAdapter } from './types/database_adapter';
import { Role, UpdateUserOperation } from './types/enums';
import { UnauthorizedError } from './types/errors';
import { IPublicSensitiveUser } from './types/user';

const PASSWORD_SALT_ROUNDS = 10;

export class Controller {
  constructor(private readonly databaseAdapter: IDatabaseAdapter) {}

  async adminUserExists(): Promise<boolean> {
    return (await this.databaseAdapter.getUsers({ role: Role.ADMIN })).length > 0;
  }

  async validateLogin(loginRequest: ILoginBody): Promise<IPublicSensitiveUser> {
    const user = await this.databaseAdapter.getUserByUsername(loginRequest.username);

    if (!user) {
      throw new UnauthorizedError('INVALID_USERNAME');
    }

    const passwordMatches = await bcrypt.compare(loginRequest.password, user.passwordHash);

    if (!passwordMatches) {
      throw new UnauthorizedError('INVALID_PASSWORD');
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
      apiKey: user.apiKey,
      languageCodes: user.languageCodes,
    };
  }

  async createUser(createOptions: ICreateUserRequest) {
    const passwordHash = await bcrypt.hash(createOptions.password, PASSWORD_SALT_ROUNDS);
    const apiKey = crypto.randomBytes(16).toString('hex');

    return this.databaseAdapter.createUser(
      createOptions.username,
      passwordHash,
      createOptions.role,
      apiKey,
      createOptions.languageCodes,
    );
  }

  async updateUser(username: string, updateOptions: IUpdateUserRequest) {
    if (updateOptions.operation === UpdateUserOperation.UPDATE_PASSWORD) {
      const passwordHash = await bcrypt.hash(updateOptions.newPassword, PASSWORD_SALT_ROUNDS);
      return this.databaseAdapter.updateUserPassword(username, passwordHash);
    }

    if (updateOptions.operation === UpdateUserOperation.UPDATE_LANGUAGES) {
      return this.databaseAdapter.updateUserLanguages(username, updateOptions.languageCodes);
    }

    if (updateOptions.operation === UpdateUserOperation.UPDATE_API_KEY) {
      const apiKey = crypto.randomBytes(16).toString('hex');
      return this.databaseAdapter.updateUserApiKey(username, apiKey);
    }

    assert.fail('Unknown update operation');
  }

  async getDocuments() {
    const documents = await this.databaseAdapter.getDocuments();
    const languageCodes = await this.databaseAdapter.getLanguageCodes();

    return documents.map(({ name }) => ({
      name,
      languageCodes,
    }));
  }

  updateSourceDocument(updaterUserId: number, documentName: string, documentBody: ISourceDocument) {
    return this.databaseAdapter.updateDocumentSourceStrings(
      updaterUserId,
      documentName,
      documentBody,
    );
  }

  getDocumentStrings(documentName: string, languageCode: string) {
    return this.databaseAdapter.getDocumentStrings(documentName, languageCode);
  }

  async updateTranslation(
    userId: number,
    stringId: number,
    languageCode: string,
    updateTranslationBody: IUpdateTranslationBody,
  ) {
    return this.databaseAdapter.updateTranslation(
      stringId,
      languageCode,
      updateTranslationBody.value,
      userId,
    );
  }

  getStringHistory(options: {
    limit?: number | undefined;
    sourceStringId?: number | undefined;
    languageCode?: string | undefined;
    historyIdOffset?: number | undefined;
  }) {
    return this.databaseAdapter.getStringHistory(options);
  }

  getStrings(query: IGetStringsQuery) {
    if (query.needingTranslation) {
      return this.databaseAdapter.getStringsNeedingTranslation(
        query.languageCode,
        query.limit,
        query.sourceStringIdOffset,
      );
    } else if (query.translated) {
      return this.databaseAdapter.getTranslatedStrings(
        query.languageCode,
        query.limit,
        query.sourceStringIdOffset,
      );
    }

    assert.fail('Unknown query type');
  }

  deleteDocument(documentName: string) {
    return this.databaseAdapter.deleteDocument(documentName);
  }

  updateDocument(documentName: string, updateOperation: IUpdateDocumentRequest) {
    return this.databaseAdapter.moveDocument(documentName, updateOperation.newName);
  }
}

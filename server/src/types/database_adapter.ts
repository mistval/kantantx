import {
  ISourceDocument,
  ISourceString,
  IStringHistory,
  ITranslatedDocument,
} from './api_schemas/strings';
import { Role } from './enums';
import { ISensitiveUser } from './user';

export interface IDatabaseAdapter {
  createUser: (
    username: string,
    passwordHash: string,
    role: Role,
    apiKey: string,
    languageCodes: string[],
  ) => Promise<ISensitiveUser>;

  getUserByUsername: (username: string) => Promise<ISensitiveUser | undefined>;
  getUserByApiKey: (apiKey: string) => Promise<ISensitiveUser | undefined>;
  getUsers: (options: { role?: Role; limit?: number }) => Promise<ISensitiveUser[]>;
  updateUserPassword: (username: string, passwordHash: string) => Promise<ISensitiveUser>;
  updateUserApiKey: (username: string, apiKey: string) => Promise<ISensitiveUser>;
  updateUserLanguages: (username: string, languageCodes: string[]) => Promise<ISensitiveUser>;
  getDocuments: () => Promise<Array<{ name: string }>>;
  moveDocument: (fromName: string, toName: string) => Promise<void>;
  deleteDocument: (name: string) => Promise<void>;
  getLanguageCodes: () => Promise<string[]>;

  getDocumentStrings: (
    documentName: string,
    languageCode: string,
  ) => Promise<ITranslatedDocument | ISourceDocument>;

  updateDocumentSourceStrings: (
    userId: number,
    documentName: string,
    sourceStrings: Array<ISourceString>,
  ) => Promise<void>;

  getStringHistory: (options?: {
    limit?: number | undefined;
    sourceStringId?: number | undefined;
    languageCode?: string | undefined;
    historyIdOffset?: number | undefined;
  }) => Promise<IStringHistory[]>;

  getStringsNeedingTranslation: (
    languageCode: string,
    limit?: number,
    sourceStringIdOffset?: number,
  ) => Promise<Array<ISourceString & { id: number }>>;

  getTranslatedStrings: (
    languageCode: string,
    limit?: number,
    sourceStringIdOffset?: number,
  ) => Promise<Array<ISourceString & { id: number }>>;

  updateTranslation: (
    sourceStringId: number,
    languageCode: string,
    value: string,
    userId: number,
  ) => Promise<void>;
}

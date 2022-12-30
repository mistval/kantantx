import { ISourceDocument, ISourceString, IStringHistory, ITranslatedDocument } from "./api_schemas/strings";
import { Role } from "./enums";
import { IPublicUser, ISensitiveUser } from "./user";

export interface IDatabaseAdapter {
  createUser: (username: string, passwordHash: string, role: Role, apiKey: string, languageCodes: string[]) => Promise<ISensitiveUser>;
  getSensitiveUser: (username: string) => Promise<ISensitiveUser | undefined>;
  updateUserPassword: (username: string, passwordHash: string) => Promise<ISensitiveUser>;
  updateUserApiKey: (username: string, apiKey: string) => Promise<ISensitiveUser>;
  updateUserLanguages: (username: string, languageCodes: string[]) => Promise<ISensitiveUser>;
  adminUserExists: () => Promise<boolean>;
  getUserByApiKey: (apiKey: string) => Promise<IPublicUser | undefined>;
  getDocuments: () => Promise<Array<{ name: string }>>;
  moveDocument: (fromName: string, toName: string) => Promise<void>;
  deleteDocument: (name: string) => Promise<void>;
  getLanguageCodes: () => Promise<Array<{ languageCode: string }>>;
  updateSourceStrings: (userId: number, documentName: string, sourceStrings: Array<ISourceString>) => Promise<void>;
  getStrings: (documentName: string, languageCode: string) => Promise<ITranslatedDocument | ISourceDocument>;
  updateTranslation: (sourceStringId: number, languageCode: string, value: string, userId: number) => Promise<void>;
  getStringHistory: (options?: { limit?: number | undefined; sourceStringId?: number | undefined; languageCode?: string | undefined; historyIdOffset?: number | undefined }) => Promise<IStringHistory[]>;
  getStringsNeedingTranslation: (languageCode: string, limit?: number, sourceStringIdOffset?: number) => Promise<Array<ISourceString & { id: number }>>;
  getTranslatedStrings: (languageCode: string, limit?: number, sourceStringIdOffset?: number) => Promise<Array<ISourceString & { id: number }>>;
}

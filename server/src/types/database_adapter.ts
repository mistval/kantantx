import { ISourceDocument, IStringHistory, ITranslatedDocument } from "./api_schemas/strings";
import { Role } from "./enums";
import { IPublicUser, ISensitiveUser } from "./user";

export interface IDatabaseAdapter {
  createUser: (username: string, passwordHash: string, role: Role, apiKey: string, languageCodes: string[]) => Promise<ISensitiveUser>;
  updateUserPassword: (username: string, passwordHash: string) => Promise<ISensitiveUser>;
  updateUserApiKey: (username: string, apiKey: string) => Promise<ISensitiveUser>;
  updateUserLanguages: (username: string, languageCodes: string[]) => Promise<ISensitiveUser>;
  adminUserExists: () => Promise<boolean>;
  getUserByApiKey: (apiKey: string) => Promise<IPublicUser | undefined>;
  getDocuments: () => Promise<Array<{ name: string }>>;
  getLanguageCodes: () => Promise<Array<{ languageCode: string }>>;
  updateSourceStrings: (userId: number, documentName: string, sourceStrings: Array<{ key: string; value: string; comment?: string; }>) => Promise<void>;
  getStrings: (documentName: string, languageCode: string) => Promise<ITranslatedDocument | ISourceDocument>;
  updateTranslation: (sourceStringId: number, languageCode: string, value: string, userId: number) => Promise<void>;
  getStringHistory: (options?: { limit?: number | undefined; sourceStringId?: number | undefined; languageCode?: string | undefined; historyIdOffset?: number | undefined }) => Promise<IStringHistory[]>;
}

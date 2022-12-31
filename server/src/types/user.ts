import { Role } from './enums';

export interface ISensitiveUser {
  id: number;
  username: string;
  passwordHash: string;
  role: Role;
  apiKey: string;
  languageCodes: string[];
}

export type IPublicSensitiveUser = Omit<ISensitiveUser, 'passwordHash'>;

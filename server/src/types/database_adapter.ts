import { Role } from "./roles";

export interface IDatabaseAdapter {
  createUser: (username: string, passwordSalt: string, passwordHash: string, role: Role, apiKey: string, languageCodes: string[]) => Promise<number>;
  updateUserPassword: (username: string, passwordSalt: string, passwordHash: string) => Promise<void>;
  updateUserApiKey: (username: string, apiKey: string) => Promise<void>;
}

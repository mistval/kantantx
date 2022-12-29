import { Role } from "./roles";

export interface IUser {
  id: number;
  username: string;
  role: Role;
  languageCodes: string[];
}

import Joi from "joi";
import { Role } from "../roles";

export interface ICreateUserBody {
  username: string;
  password?: string;
  role: Role;
};

export const createUserBody = Joi.object<ICreateUserBody>({
  username: Joi.string().min(1).required(),
  password: Joi.string().min(1).optional(),
  role: Joi.valid(...Object.keys(Role)).required(),
});

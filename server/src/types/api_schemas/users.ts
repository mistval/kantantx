import Joi from 'joi';
import { Role, UpdateUserOperation } from '../enums';

export interface ICreateUserRequest {
  username: string;
  password: string;
  role: Role;
  languageCodes: string[];
}

export const createUserBody = Joi.object<ICreateUserRequest>({
  username: Joi.string().min(1).required(),
  password: Joi.string().min(1).required(),
  role: Joi.valid(...Object.keys(Role)).required(),
  languageCodes: Joi.array().items(Joi.string().min(1)).required(),
});

interface IBaseUpdateUserRequest {
  operation: UpdateUserOperation;
}

interface IUpdateUserPasswordRequest extends IBaseUpdateUserRequest {
  operation: UpdateUserOperation.UPDATE_PASSWORD;
  newPassword: string;
}

interface IUpdateUserLanguagesRequest extends IBaseUpdateUserRequest {
  operation: UpdateUserOperation.UPDATE_LANGUAGES;
  languageCodes: string[];
}

interface IUpdateUserApiKeyRequest extends IBaseUpdateUserRequest {
  operation: UpdateUserOperation.UPDATE_API_KEY;
}

export type IUpdateUserRequest =
  | IUpdateUserPasswordRequest
  | IUpdateUserLanguagesRequest
  | IUpdateUserApiKeyRequest;

const updatePasswordBody = Joi.object<IUpdateUserPasswordRequest>({
  operation: Joi.valid(UpdateUserOperation.UPDATE_PASSWORD).required(),
  newPassword: Joi.string().min(1).required(),
});

const updateLanguagesBody = Joi.object<IUpdateUserLanguagesRequest>({
  operation: Joi.valid(UpdateUserOperation.UPDATE_LANGUAGES).required(),
  languageCodes: Joi.array().items(Joi.string().min(1)).required(),
});

const updateApiKeyBody = Joi.object<IUpdateUserApiKeyRequest>({
  operation: Joi.valid(UpdateUserOperation.UPDATE_API_KEY).required(),
});

export const updateUserBody = Joi.alternatives<IUpdateUserRequest>().try(
  updatePasswordBody,
  updateLanguagesBody,
  updateApiKeyBody,
);

export interface ILoginBody {
  username: string;
  password: string;
}

export const loginBody = Joi.object<ILoginBody>({
  username: Joi.string().min(1).required(),
  password: Joi.string().min(1).required(),
});

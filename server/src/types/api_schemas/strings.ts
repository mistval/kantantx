import Joi from "joi";

export interface ISourceString {
  key: string;
  value: string;
  comment?: string;
};

export interface ITranslatedString {
  key: string;
  value: string;
}

export type ISourceDocument = ISourceString[];
export type ITranslatedDocument = ITranslatedString[];

const sourceStringSchema = Joi.object<ISourceString>({
  key: Joi.string().min(1).required(),
  value: Joi.string().required(),
  comment: Joi.string().optional(),
});

export const sourceDocumentBody = Joi.array().items(sourceStringSchema).required();

export const documentFetchQuery = Joi.object({
  languageCode: Joi.string().min(1).required(),
});

export interface IUpdateTranslationBody {
  value: string;
}

export const updateTranslationBody = Joi.object<IUpdateTranslationBody>({
  value: Joi.string().required(),
});

export interface IStringHistory {
  username: string;
  sourceValue: string;
  documentName: string;
  languageCode: string;
  eventType: string;
  value: string;
  eventDate: string;
}

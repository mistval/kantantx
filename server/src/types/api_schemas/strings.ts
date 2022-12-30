import Joi from "joi";

export interface ISourceString {
  key: string;
  value: string;
  additionalFields?: Array<{
    fieldName: string;
    value: string;
    uiHidden?: boolean;
  }>;
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
  additionalFields: Joi.array().items(
    Joi.object({
      fieldName: Joi.string().min(1).required(),
      value: Joi.string().required(),
      uiHidden: Joi.boolean().optional(),
    })
  ).required(),
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
};

export interface IStringHistoryQuery {
  limit?: number;
  sourceStringId?: number;
  languageCode?: string;
  historyIdOffset?: number;
};

export const stringHistoryQuery = Joi.object<IStringHistoryQuery>({
  limit: Joi.number().min(1).max(100).optional(),
  sourceStringId: Joi.number().min(1).optional(),
  languageCode: Joi.string().optional(),
  historyIdOffset: Joi.number().min(1).optional(),
});

export interface IGetStringsQuery {
  languageCode: string;
  limit?: number;
  sourceStringIdOffset?: number;
  needingTranslation?: string;
  translated?: string;
};

const getTranslatedStringsQuery = Joi.object<IGetStringsQuery>({
  languageCode: Joi.string().min(1).required(),
  limit: Joi.number().min(1).max(100).optional(),
  sourceStringIdOffset: Joi.number().optional(),
  translated: Joi.boolean().valid(true).required(),
});

const getUntranslatedStringsQuery = Joi.object<IGetStringsQuery>({
  languageCode: Joi.string().min(1).required(),
  limit: Joi.number().min(1).max(100).optional(),
  sourceStringIdOffset: Joi.number().optional(),
  needingTranslation: Joi.boolean().valid(true).required(),
});

export const getStringsQuerySchema = Joi.alternatives().try(getTranslatedStringsQuery, getUntranslatedStringsQuery);

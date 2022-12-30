import Joi from 'joi';

export interface IUpdateDocumentRequest {
  operation: 'move';
  newName: string;
}

export const updateDocumentRequestSchema = Joi.object<IUpdateDocumentRequest>({
  operation: Joi.valid('move').required(),
  newName: Joi.string().min(1).required(),
});

import assert from 'assert';
import express from 'express';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { createValidator } from 'express-joi-validation';
import { BetterSQLite3Database } from './database_adapters/better_sqlite3';
import { initializeAdminUser } from './initialization';
import { createUserBody, ICreateUserRequest, IUpdateUserRequest, updateUserBody } from './types/api_schemas/users';
import { IDatabaseAdapter } from './types/database_adapter';
import { createAttachUserMiddleware } from './middleware/authentication';
import { adminOnly, checkTranslatorLanguage } from './middleware/authorization';
import { Controller } from './controller';
import { documentFetchQuery, ISourceDocument, IUpdateTranslationBody, sourceDocumentBody, updateTranslationBody } from './types/api_schemas/strings';
import { assertIsAuthenticatedRequest } from './types/type_guards';
import { BadRequestError } from './types/errors';

async function main() {
  const database: IDatabaseAdapter = new BetterSQLite3Database('./database.db');
  const controller = new Controller(database);

  await initializeAdminUser(database);

  const app = express();
  app.use(cookieParser());
  app.use(morgan('combined'));
  app.use(createAttachUserMiddleware(database));

  const validator = createValidator();

  app.post('/api/v1/users', adminOnly, validator.body(createUserBody), async (req, res, next) => {
    try {
      const result = await controller.createUser(req.body as ICreateUserRequest);
      return res.status(201).json(result);
    } catch (err) {
      return next(err);
    }
  });

  app.patch('/api/v1/users/:username', adminOnly, validator.body(updateUserBody), async (req, res, next) => {
    try {
      const username = req.params['username'];
      assert(username, 'Username is required');
      const result = await controller.updateUser(username, req.body as IUpdateUserRequest);
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  });

  app.get('/api/v1/documents', adminOnly, async (_req, res, next) => {
    try {
      const result = await controller.getDocuments();
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  });

  app.put('/api/v1/documents/:documentName/strings', adminOnly, validator.body(sourceDocumentBody), async (req, res, next) => {
    try {
      const documentName = req.params['documentName'];
      assert(documentName, 'Document name is required');
      assertIsAuthenticatedRequest(req);
      const result = await controller.updateSourceDocument(req.user.id, documentName, req.body as ISourceDocument);
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  });
  
  app.get('/api/v1/documents/:documentName/strings', adminOnly, validator.query(documentFetchQuery), async (req, res, next) => {
    try {
      const documentName = req.params['documentName'];
      const languageCode = req.query['languageCode'] as string | undefined;
      assert(documentName, 'Document name is required');
      assert(languageCode, 'Language code is required');
      const result = await controller.getDocumentStrings(documentName, languageCode);
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  });
  
  app.put('/api/v1/strings/:stringId/translations/:languageCode', checkTranslatorLanguage, validator.body(updateTranslationBody), async (req, res, next) => {
    try {
      const stringId = Number(req.params['stringId']);
      const languageCode = req.params['languageCode'];
      assert(stringId && stringId > 0, 'String ID is required');
      assert(languageCode, 'Language code is required');
      assertIsAuthenticatedRequest(req);
      const result = await controller.updateTranslation(req.user.id, stringId, languageCode, req.body as IUpdateTranslationBody);
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  });
  
  app.get('/api/v1/stringhistory', async (req, res, next) => {
    try {
      const sourceStringId = req.query['sourceStringId'] ? Number(req.query['sourceStringId']) : undefined;
      const languageCode = req.query['languageCode'] as string | undefined;
      const historyIdOffset  = req.query['historyIdOffset'] ? Number(req.query['historyIdOffset']) : undefined;
      const limit = req.query['limit'] ? Number(req.query['limit']) : undefined;
      
      const invalidArgument =
        (sourceStringId !== undefined && !(sourceStringId > 0)) || // invalid sourceStringId
        (historyIdOffset !== undefined && !(historyIdOffset > 0)) || // invalid historyIdOffset
        (limit !== undefined && (!(limit > 0) || !(limit <= 100))); // invalid limit

      if (invalidArgument) {
        throw new BadRequestError('INVALID_QUERY_PARAMETERS');
      }

      const result = await controller.getStringHistory({ sourceStringId, languageCode, historyIdOffset, limit });
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }    
  });

  const port = process.env['PORT'] ?? 3000;
  
  app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

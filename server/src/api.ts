import 'dotenv/config';
import assert from 'assert';
import express from 'express';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { createValidator } from 'express-joi-validation';
import { BetterSQLite3Database } from './database_adapters/better_sqlite3';
import { initializeAdminUser } from './initialization';
import {
  createUserBody,
  ICreateUserRequest,
  ILoginBody,
  IUpdateUserRequest,
  loginBody,
  updateUserBody,
} from './types/api_schemas/users';
import { IDatabaseAdapter } from './types/database_adapter';
import { createAttachUserMiddleware } from './middleware/authentication';
import { adminOnly, checkTranslatorLanguage } from './middleware/authorization';
import { Controller } from './controller';
import {
  documentFetchQuery,
  getStringsQuerySchema,
  IGetStringsQuery,
  ISourceDocument,
  IStringHistoryQuery,
  IUpdateTranslationBody,
  sourceDocumentBody,
  stringHistoryQuery,
  updateTranslationBody,
} from './types/api_schemas/strings';
import { assertIsAuthenticatedRequest } from './types/type_guards';
import { ApiError } from './types/errors';
import { IUpdateDocumentRequest, updateDocumentRequestSchema } from './types/api_schemas/documents';
import { IPublicSensitiveUser, ISensitiveUser } from './types/user';

function censorUser(user: ISensitiveUser): IPublicSensitiveUser {
  const { passwordHash, ...rest } = user;
  return rest;
}

async function main() {
  const database: IDatabaseAdapter = new BetterSQLite3Database('./database.db');
  const controller = new Controller(database);

  await initializeAdminUser(controller);

  const app = express();
  app.use(morgan('combined'));
  app.use(cookieParser());
  app.use(express.json());

  const validator = createValidator();

  app.post('/api/v1/login', validator.body(loginBody), async (req, res, next) => {
    try {
      const user = await controller.validateLogin(req.body as ILoginBody);
      res.cookie('apiKey', user.apiKey, { httpOnly: true, secure: true, sameSite: 'strict' });
      return res.status(200).json({ success: true, apiKey: user.apiKey });
    } catch (err) {
      return next(err);
    }
  });

  app.use(createAttachUserMiddleware(database));

  app.post('/api/v1/logout', async (_req, res) => {
    res.clearCookie('apiKey');
    return res.status(200).json({ success: true });
  });

  app.post('/api/v1/users', adminOnly, validator.body(createUserBody), async (req, res, next) => {
    try {
      const result = await controller.createUser(req.body as ICreateUserRequest);
      return res.status(201).json(censorUser(result));
    } catch (err) {
      return next(err);
    }
  });

  app.patch(
    '/api/v1/users/:username',
    adminOnly,
    validator.body(updateUserBody),
    async (req, res, next) => {
      try {
        const username = req.params['username'];
        assert(username, 'Username is required');
        const result = await controller.updateUser(username, req.body as IUpdateUserRequest);
        return res.status(200).json(censorUser(result));
      } catch (err) {
        return next(err);
      }
    },
  );

  app.get('/api/v1/documents', adminOnly, async (_req, res, next) => {
    try {
      const result = await controller.getDocuments();
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  });

  app.delete('/api/v1/documents/:documentName', adminOnly, async (req, res, next) => {
    try {
      const documentName = req.params['documentName'];
      assert(documentName, 'Document name is required');
      await controller.deleteDocument(documentName);
      return res.status(200).json({ success: true });
    } catch (err) {
      return next(err);
    }
  });

  app.patch(
    '/api/v1/documents/:documentName',
    adminOnly,
    validator.body(updateDocumentRequestSchema),
    async (req, res, next) => {
      try {
        const documentName = req.params['documentName'];
        assert(documentName, 'Document name is required');
        await controller.updateDocument(documentName, req.body as IUpdateDocumentRequest);
        return res.status(200).json({ success: true });
      } catch (err) {
        return next(err);
      }
    },
  );

  app.put(
    '/api/v1/documents/:documentName/strings',
    adminOnly,
    validator.body(sourceDocumentBody),
    async (req, res, next) => {
      try {
        const documentName = req.params['documentName'];
        assert(documentName, 'Document name is required');
        assertIsAuthenticatedRequest(req);
        await controller.updateSourceDocument(
          req.user.id,
          documentName,
          req.body as ISourceDocument,
        );
        return res.status(200).json({ success: true });
      } catch (err) {
        return next(err);
      }
    },
  );

  app.get(
    '/api/v1/documents/:documentName/strings',
    adminOnly,
    validator.query(documentFetchQuery),
    async (req, res, next) => {
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
    },
  );

  app.put(
    '/api/v1/strings/:stringId/translations/:languageCode',
    checkTranslatorLanguage,
    validator.body(updateTranslationBody),
    async (req, res, next) => {
      try {
        const stringId = Number(req.params['stringId']);
        const languageCode = req.params['languageCode'];
        assert(stringId && stringId > 0, 'String ID is required');
        assert(languageCode, 'Language code is required');
        assertIsAuthenticatedRequest(req);
        const result = await controller.updateTranslation(
          req.user.id,
          stringId,
          languageCode,
          req.body as IUpdateTranslationBody,
        );
        return res.status(200).json(result);
      } catch (err) {
        return next(err);
      }
    },
  );

  app.get('/api/v1/strings', validator.query(getStringsQuerySchema), async (req, res, next) => {
    try {
      const result = await controller.getStrings(req.query as unknown as IGetStringsQuery);
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  });

  app.get('/api/v1/stringhistory', validator.query(stringHistoryQuery), async (req, res, next) => {
    try {
      const result = await controller.getStringHistory(req.query as IStringHistoryQuery);
      return res.status(200).json(result);
    } catch (err) {
      return next(err);
    }
  });

  app.use(
    (err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const httpStatus = err instanceof ApiError ? err.httpStatus : 500;
      const errorCode = err instanceof ApiError ? err.code : 'INTERNAL_SERVER_ERROR';
      const details = err instanceof ApiError ? err.details : undefined;

      res.status(httpStatus).json({
        error: errorCode,
        details,
      });

      if (httpStatus === 500) {
        console.error(err);
      }
    },
  );

  const port = process.env['PORT'] ?? 3000;

  app.listen(port, () => {
    console.log(`Listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

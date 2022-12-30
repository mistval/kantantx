import express from 'express';
import { IAuthenticatedRequest } from '../types/api';
import { IDatabaseAdapter } from '../types/database_adapter';
import { UnauthorizedError } from '../types/errors';

export function createAttachUserMiddleware(database: IDatabaseAdapter) {
  return async function (req: express.Request, _res: express.Response, next: express.NextFunction) {
    try {
      const apiKey = req.header('authorization')?.replace('Bearer ', '') ?? req.cookies.apiKey;
  
      if (!apiKey) {
        return next(new UnauthorizedError('NO_API_KEY', 'You must provide an API key, either in the Authorization header or in the apiKey cookie.'));
      }
    
      const user = await database.getUserByApiKey(apiKey);

      if (!user) {
        return next(new UnauthorizedError('INVALID_API_KEY', 'The API key provided is invalid.'));
      }

      (req as IAuthenticatedRequest).user = user;
    } catch (err) {
      return next(err);
    }
  }
}

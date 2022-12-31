import assert from 'assert';
import express from 'express';
import { Role } from '../types/enums';
import { ForbiddenError } from '../types/errors';
import { assertIsAuthenticatedRequest } from '../types/type_guards';

export function adminOnly(req: express.Request, _: express.Response, next: express.NextFunction) {
  assertIsAuthenticatedRequest(req);

  if (req.user.role !== Role.ADMIN) {
    return next(new ForbiddenError('NOT_ADMIN', 'You must be an admin to access this resource.'));
  } else {
    return next();
  }
}

export function checkTranslatorLanguage(
  req: express.Request,
  _: express.Response,
  next: express.NextFunction,
) {
  assertIsAuthenticatedRequest(req);

  if (req.user.role === Role.ADMIN) {
    return next();
  }

  if (req.user.role === Role.TRANSLATOR) {
    const languageCode = req.params['languageCode'];
    if (req.user.languageCodes.includes(languageCode ?? '')) {
      return next();
    }

    return next(
      new ForbiddenError(
        'NOT_TRANSLATOR_FOR_LANGUAGE',
        'You must be a translator for this language to access this resource.',
      ),
    );
  }

  assert.fail(`Unknown role: ${req.user.role}`);
}

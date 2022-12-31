import assert from 'assert';
import { IAuthenticatedRequest } from './api';

export function assertIsAuthenticatedRequest(req: any): asserts req is IAuthenticatedRequest {
  assert(req.user, 'Request is not authenticated');
}

import express from 'express';
import { IPublicUser } from './user';

export interface IAuthenticatedRequest extends express.Request {
  user: IPublicUser;
}

import { AuthenticatedUser } from './common.types';

declare global {
  namespace Express {
    interface User extends AuthenticatedUser {}
  }
}

export {};
import { AuthenticatedUser } from './common.types';

declare global {
  namespace Express {
    interface User extends AuthenticatedUser {}
    interface Request {
      requestId?: string;
    }
  }
}

export {};

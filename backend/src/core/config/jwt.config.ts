import { registerAs } from '@nestjs/config';

export const jwtConfig = registerAs('jwt', () => ({
  secret:
    process.env.JWT_SECRET ||
    (process.env.NODE_ENV === 'production'
      ? undefined
      : 'dev-only-secret-change-me-before-production'),
  expiresIn: process.env.JWT_EXPIRES_IN || '7d',
}));

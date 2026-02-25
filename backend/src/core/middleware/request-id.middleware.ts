import { randomUUID } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

function normalizeHeaderValue(value: unknown) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.slice(0, 100);
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction) {
  const requestId = normalizeHeaderValue(req.headers['x-request-id']) ?? randomUUID();
  req.requestId = requestId;
  res.setHeader('x-request-id', requestId);
  next();
}


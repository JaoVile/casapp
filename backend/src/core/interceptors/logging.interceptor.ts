import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
import type { Request, Response } from 'express';
import { StructuredLoggerService } from '../../shared/services/structured-logger.service';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: StructuredLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse<Response>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        const latencyMs = Date.now() - startedAt;
        this.logger.info({
          event: 'http_request',
          requestId: request.requestId ?? null,
          userId: request.user?.id ?? null,
          method: request.method,
          route: request.originalUrl || request.url,
          statusCode: response.statusCode,
          latencyMs,
        });
      }),
      catchError((error: unknown) => {
        const latencyMs = Date.now() - startedAt;
        const err = error as Error & { status?: number };

        this.logger.error({
          event: 'http_error',
          requestId: request.requestId ?? null,
          userId: request.user?.id ?? null,
          method: request.method,
          route: request.originalUrl || request.url,
          statusCode: err.status ?? response.statusCode ?? 500,
          latencyMs,
          errorName: err.name,
          errorMessage: err.message,
          errorStack: err.stack ?? null,
        });

        return throwError(() => error);
      }),
    );
  }
}

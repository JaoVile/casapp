import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SentryService } from '../../shared/services/sentry.service';
import { StructuredLoggerService } from '../../shared/services/structured-logger.service';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(
    private readonly sentry: SentryService,
    private readonly logger: StructuredLoggerService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Erro interno do servidor';
    let errors: unknown = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const res = exceptionResponse as Record<string, unknown>;
        message = (res.message as string) || message;
        errors = res.errors ?? null;
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    const requestContext = {
      requestId: request.requestId ?? null,
      userId: request.user?.id ?? null,
      method: request.method,
      route: request.originalUrl || request.url,
      statusCode: status,
      ip: request.ip || request.socket?.remoteAddress || null,
    };

    if (status >= 500) {
      this.sentry.captureException(exception, { request: requestContext });
    }

    const err = exception as Error;
    this.logger.error({
      event: 'exception_filter',
      ...requestContext,
      errorName: err.name ?? 'Error',
      errorMessage: err.message ?? String(exception),
      errorStack: err.stack ?? null,
    });

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      errors,
      requestId: request.requestId ?? null,
      timestamp: new Date().toISOString(),
    });
  }
}

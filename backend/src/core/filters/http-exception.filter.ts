import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    HttpException,
    HttpStatus,
    Logger,
  } from '@nestjs/common';
  import { Response } from 'express';
  
  @Catch()
  export class HttpExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(HttpExceptionFilter.name);
  
    catch(exception: unknown, host: ArgumentsHost) {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<Response>();
  
      let status = HttpStatus.INTERNAL_SERVER_ERROR;
      let message = 'Erro interno do servidor';
      let errors: any = null;
  
      if (exception instanceof HttpException) {
        status = exception.getStatus();
        const exceptionResponse = exception.getResponse();
  
        if (typeof exceptionResponse === 'string') {
          message = exceptionResponse;
        } else if (typeof exceptionResponse === 'object') {
          const res = exceptionResponse as any;
          message = res.message || message;
          errors = res.errors || null;
        }
      } else if (exception instanceof Error) {
        message = exception.message;
        this.logger.error(exception.message, exception.stack);
      }
  
      response.status(status).json({
        success: false,
        statusCode: status,
        message,
        errors,
        timestamp: new Date().toISOString(),
      });
    }
  }
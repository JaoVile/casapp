import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    BadRequestException,
  } from '@nestjs/common';
  import { Response } from 'express';
  
  @Catch(BadRequestException)
  export class ValidationExceptionFilter implements ExceptionFilter {
    catch(exception: BadRequestException, host: ArgumentsHost) {
      const ctx = host.switchToHttp();
      const response = ctx.getResponse<Response>();
      const status = exception.getStatus();
      const exceptionResponse = exception.getResponse() as any;
  
      response.status(status).json({
        success: false,
        statusCode: status,
        message: 'Erro de validação',
        errors: exceptionResponse.message,
        timestamp: new Date().toISOString(),
      });
    }
  }
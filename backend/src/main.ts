import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import type { Express } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { AppModule } from './app.module';
import { requestIdMiddleware } from './core/middleware/request-id.middleware';
import { SanitizationPipe } from './core/pipes/sanitization.pipe';

function parseCorsOrigins() {
  const fallback = 'http://localhost:5173';
  const env = process.env.FRONTEND_URL || fallback;
  return env
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-site');
  next();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
    rawBody: false,
  });
  const logger = new Logger('Bootstrap');
  const expressApp = app.getHttpAdapter().getInstance() as Express;

  expressApp.set('trust proxy', 1);
  expressApp.disable('x-powered-by');
  app.use(requestIdMiddleware);
  app.use(securityHeadersMiddleware);
  app.use(json({ limit: process.env.HTTP_JSON_LIMIT || '1mb' }));
  app.use(
    urlencoded({
      extended: true,
      limit: process.env.HTTP_URLENCODED_LIMIT || '1mb',
    }),
  );

  app.enableCors({
    origin: parseCorsOrigins(),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 60 * 60,
  });

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new SanitizationPipe(),
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('HomeHub API')
      .setDescription('API para gestao de casa compartilhada')
      .setVersion('1.1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);
  }

  if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET obrigatorio em producao');
  }

  const port = Number(process.env.PORT || 3333);
  await app.listen(port);

  logger.log(`Server running on http://localhost:${port}`);
  logger.log(`Docs available at http://localhost:${port}/docs`);
}

bootstrap();

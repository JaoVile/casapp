import { Test } from '@nestjs/testing';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { INestApplication } from '@nestjs/common';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../shared/database/prisma.service';
import { RedisService } from '../../shared/redis/redis.service';

describe('OpenAPI Contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: jest.fn(),
      })
      .overrideProvider(RedisService)
      .useValue({
        ping: jest.fn().mockResolvedValue('PONG'),
      })
      .compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('contains expected critical paths in Swagger document', () => {
    const config = new DocumentBuilder()
      .setTitle('CasApp API')
      .setDescription('Contrato da API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    const document = SwaggerModule.createDocument(app, config);
    const paths = Object.keys(document.paths);

    expect(paths).toEqual(
      expect.arrayContaining([
        '/auth/login',
        '/auth/register',
        '/auth/forgot-password',
        '/auth/reset-password',
        '/auth/sessions',
        '/auth/logout-all',
        '/auth/sessions/{sessionId}',
        '/expenses',
        '/shopping',
        '/tasks',
        '/audit-logs',
        '/notifications',
        '/notifications/unread-count',
        '/notifications/{id}/read',
        '/notifications/read-all',
        '/health',
        '/ready',
        '/metrics',
      ]),
    );
  });
});

import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { PrismaService } from '../shared/database/prisma.service';
import { RedisService } from '../shared/redis/redis.service';

describe('App E2E', () => {
  let app: INestApplication;
  let baseUrl = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
      })
      .overrideProvider(RedisService)
      .useValue({
        ping: jest.fn().mockResolvedValue('PONG'),
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
    await app.listen(0);

    const server = app.getHttpServer() as { address: () => { port: number } };
    const address = server.address();
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it('GET /api/health returns liveness payload', async () => {
    const response = await fetch(`${baseUrl}/api/health`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(
      expect.objectContaining({
        status: 'ok',
        service: 'casapp-backend',
      }),
    );
  });

  it('GET /api/ready returns readiness payload', async () => {
    const response = await fetch(`${baseUrl}/api/ready`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(
      expect.objectContaining({
        status: 'ready',
        ready: true,
      }),
    );
    expect(body.data.dependencies).toEqual(
      expect.objectContaining({
        postgres: expect.objectContaining({ status: 'up' }),
        redis: expect.objectContaining({ status: 'up' }),
        scheduler: expect.objectContaining({ status: 'up' }),
      }),
    );
  });

  it('GET /api/metrics returns operational metrics payload', async () => {
    const response = await fetch(`${baseUrl}/api/metrics`);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data).toEqual(
      expect.objectContaining({
        status: expect.stringMatching(/ok|degraded/),
        process: expect.objectContaining({
          pid: expect.any(Number),
          nodeVersion: expect.any(String),
          uptimeSec: expect.any(Number),
          memory: expect.objectContaining({
            rss: expect.any(Number),
            heapTotal: expect.any(Number),
            heapUsed: expect.any(Number),
          }),
        }),
      }),
    );
  });
});

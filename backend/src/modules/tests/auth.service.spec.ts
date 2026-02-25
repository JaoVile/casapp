import { HttpException } from '@nestjs/common';
import { AuthRateLimitService } from '../auth/services/auth-rate-limit.service';

describe('AuthRateLimitService', () => {
  it('allows requests before the attempt threshold', async () => {
    const service = new AuthRateLimitService();

    await service.registerFailure('login:test');
    await service.registerFailure('login:test');

    await expect(service.assertAllowed('login:test')).resolves.toBeUndefined();
  });

  it('can unblock after a successful attempt', async () => {
    const service = new AuthRateLimitService();

    for (let index = 0; index < 7; index += 1) {
      await service.registerFailure('login:test');
    }

    await expect(service.assertAllowed('login:test')).rejects.toBeInstanceOf(HttpException);

    await service.registerSuccess('login:test');

    await expect(service.assertAllowed('login:test')).resolves.toBeUndefined();
  });

  it('blocks by any key when using combined limits', async () => {
    const service = new AuthRateLimitService();

    for (let index = 0; index < 7; index += 1) {
      await service.registerFailure(['login:ip:1.1.1.1', 'login:identifier:user@email.com']);
    }

    await expect(
      service.assertAllowed(['login:ip:1.1.1.1', 'login:identifier:user@email.com']),
    ).rejects.toBeInstanceOf(HttpException);
  });
});

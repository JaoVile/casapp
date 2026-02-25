import { AuthController } from '../auth/auth.controller';

describe('AuthController', () => {
  it('returns the profile from auth service in me()', async () => {
    const profile = { id: 'user-1', name: 'User 1' };
    const authService = {
      getProfile: jest.fn().mockResolvedValue(profile),
    } as any;
    const rateLimitService = {
      assertAllowed: jest.fn(),
      registerSuccess: jest.fn(),
      registerFailure: jest.fn(),
    } as any;

    const controller = new AuthController(authService, rateLimitService);
    const result = await controller.me({ id: 'user-1' });

    expect(authService.getProfile).toHaveBeenCalledWith('user-1');
    expect(result).toEqual(profile);
  });
});

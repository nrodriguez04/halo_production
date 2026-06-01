import {
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { AuthGuard } from '../auth.guard';

describe('AuthGuard internal service token support', () => {
  const originalInternalToken = process.env.INTERNAL_API_TOKEN;

  beforeEach(() => {
    process.env.INTERNAL_API_TOKEN = 'internal-test-token';
  });

  afterEach(() => {
    if (originalInternalToken === undefined) {
      delete process.env.INTERNAL_API_TOKEN;
    } else {
      process.env.INTERNAL_API_TOKEN = originalInternalToken;
    }
  });

  it('accepts the internal token when an account header is supplied', async () => {
    const guard = new AuthGuard();
    const request: any = {
      headers: {
        authorization: 'Bearer internal-test-token',
        'x-internal-account-id': 'acc_internal',
        'x-internal-actor': 'worker',
      },
    };

    await expect(guard.canActivate(mockContext(request))).resolves.toBe(true);
    expect(request.accountId).toBe('acc_internal');
    expect(request.authActor).toBe('worker');
    expect(request.user).toMatchObject({
      accountId: 'acc_internal',
      internal: true,
    });
  });

  it('rejects the internal token when the account header is missing', async () => {
    const guard = new AuthGuard();
    const request: any = {
      headers: {
        authorization: 'Bearer internal-test-token',
      },
    };

    await expect(guard.canActivate(mockContext(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });
});

function mockContext(request: any): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as ExecutionContext;
}

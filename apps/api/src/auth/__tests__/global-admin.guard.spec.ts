import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { GlobalAdminGuard } from '../global-admin.guard';
import { AuthGuard } from '../auth.guard';
import { PermissionsGuard } from '../permissions.guard';
import { ControlPlaneController } from '../../control-plane/control-plane.controller';
import { IntegrationSecretsController } from '../../integration-secrets/integration-secrets.controller';
import { ChaosController } from '../../chaos/chaos.controller';

describe('GlobalAdminGuard', () => {
  let guard: GlobalAdminGuard;

  beforeEach(() => {
    guard = new GlobalAdminGuard();
  });

  const createContext = (user: Record<string, unknown>): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    }) as ExecutionContext;

  it('allows requests from the GLOBAL account', () => {
    expect(
      guard.canActivate(
        createContext({
          accountId: 'GLOBAL',
          permissions: ['control_plane:write'],
          roles: ['Tenant Admin'],
        }),
      ),
    ).toBe(true);
  });

  it('allows requests with the admin:all permission', () => {
    expect(
      guard.canActivate(
        createContext({
          accountId: 'tenant-1',
          permissions: ['control_plane:write', 'admin:all'],
          roles: ['Tenant Admin'],
        }),
      ),
    ).toBe(true);
  });

  it('allows requests with a platform-admin role', () => {
    expect(
      guard.canActivate(
        createContext({
          accountId: 'tenant-1',
          permissions: ['control_plane:write'],
          roles: ['Platform Admin'],
        }),
      ),
    ).toBe(true);
  });

  it('rejects tenant-scoped admins without a global marker', () => {
    expect(() =>
      guard.canActivate(
        createContext({
          accountId: 'tenant-1',
          permissions: ['control_plane:write'],
          roles: ['Tenant Admin'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('protects singleton admin controllers with the global-admin guard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ControlPlaneController)).toEqual(
      expect.arrayContaining([AuthGuard, PermissionsGuard, GlobalAdminGuard]),
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, IntegrationSecretsController),
    ).toEqual(
      expect.arrayContaining([AuthGuard, PermissionsGuard, GlobalAdminGuard]),
    );
    expect(Reflect.getMetadata(GUARDS_METADATA, ChaosController)).toEqual(
      expect.arrayContaining([AuthGuard, PermissionsGuard, GlobalAdminGuard]),
    );
  });
});

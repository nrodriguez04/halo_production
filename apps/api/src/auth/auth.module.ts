import { Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { AuthOrInternalTokenGuard } from './auth-or-internal-token.guard';
import { PermissionsGuard } from './permissions.guard';

@Module({
  providers: [AuthGuard, AuthOrInternalTokenGuard, PermissionsGuard],
  exports: [AuthGuard, AuthOrInternalTokenGuard, PermissionsGuard],
})
export class AuthModule {}


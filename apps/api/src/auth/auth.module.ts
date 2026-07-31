import { Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { GlobalAdminGuard } from './global-admin.guard';
import { PermissionsGuard } from './permissions.guard';

@Module({
  providers: [AuthGuard, PermissionsGuard, GlobalAdminGuard],
  exports: [AuthGuard, PermissionsGuard, GlobalAdminGuard],
})
export class AuthModule {}


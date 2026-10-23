import { Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { GlobalAdminGuard } from './global-admin.guard';
import { PermissionsGuard } from './permissions.guard';
import { SessionController } from './session.controller';

@Module({
  controllers: [SessionController],
  providers: [AuthGuard, PermissionsGuard, GlobalAdminGuard],
  exports: [AuthGuard, PermissionsGuard, GlobalAdminGuard],
})
export class AuthModule {}

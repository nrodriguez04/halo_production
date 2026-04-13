import { Module } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { PermissionsGuard } from './permissions.guard';

@Module({
  providers: [AuthGuard, PermissionsGuard],
  exports: [AuthGuard, PermissionsGuard],
})
export class AuthModule {}


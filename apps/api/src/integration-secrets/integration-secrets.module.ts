import { Module } from '@nestjs/common';
import { IntegrationSecretsController } from './integration-secrets.controller';
import { IntegrationSecretsService } from './integration-secrets.service';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [IntegrationSecretsController],
  providers: [IntegrationSecretsService, PrismaService],
  exports: [IntegrationSecretsService],
})
export class IntegrationSecretsModule {}

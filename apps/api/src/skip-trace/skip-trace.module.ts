import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { IntegrationSecretsModule } from '../integration-secrets/integration-secrets.module';
import { BatchSkipTraceAdapter } from './adapters/batch-skip-trace.adapter';
import { StubSkipTraceAdapter } from './adapters/stub-skip-trace.adapter';
import { SkipTraceController } from './skip-trace.controller';
import { SkipTraceService } from './skip-trace.service';
import { LeadSkipTraceService } from './lead-skip-trace.service';

@Global()
@Module({
  imports: [AuthModule, IntegrationSecretsModule],
  controllers: [SkipTraceController],
  providers: [
    BatchSkipTraceAdapter,
    StubSkipTraceAdapter,
    SkipTraceService,
    LeadSkipTraceService,
  ],
  exports: [SkipTraceService, LeadSkipTraceService],
})
export class SkipTraceModule {}

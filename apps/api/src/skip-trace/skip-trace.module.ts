import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';
import { BatchSkipTraceAdapter } from './adapters/batch-skip-trace.adapter';
import { StubSkipTraceAdapter } from './adapters/stub-skip-trace.adapter';
import { SkipTraceController } from './skip-trace.controller';
import { SkipTraceService } from './skip-trace.service';
import { LeadSkipTraceService } from './lead-skip-trace.service';

@Global()
@Module({
  imports: [AuthModule],
  controllers: [SkipTraceController],
  providers: [
    PrismaService,
    BatchSkipTraceAdapter,
    StubSkipTraceAdapter,
    SkipTraceService,
    LeadSkipTraceService,
  ],
  exports: [SkipTraceService, LeadSkipTraceService],
})
export class SkipTraceModule {}

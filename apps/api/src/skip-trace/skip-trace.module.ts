import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { AuthModule } from '../auth/auth.module';
import { PropertyRadarModule } from '../integrations/propertyradar/propertyradar.module';
import { BatchSkipTraceAdapter } from './adapters/batch-skip-trace.adapter';
import { PropertyRadarSkipTraceAdapter } from './adapters/propertyradar-skip-trace.adapter';
import { StubSkipTraceAdapter } from './adapters/stub-skip-trace.adapter';
import { SkipTraceController } from './skip-trace.controller';
import { SkipTraceService } from './skip-trace.service';

@Global()
@Module({
  imports: [AuthModule, PropertyRadarModule],
  controllers: [SkipTraceController],
  providers: [
    PrismaService,
    BatchSkipTraceAdapter,
    StubSkipTraceAdapter,
    PropertyRadarSkipTraceAdapter,
    SkipTraceService,
  ],
  exports: [SkipTraceService],
})
export class SkipTraceModule {}

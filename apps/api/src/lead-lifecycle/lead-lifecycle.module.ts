import { Global, Module } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TimelineModule } from '../timeline/timeline.module';
import { LeadLifecycleController } from './lead-lifecycle.controller';
import { LeadLifecycleService } from './lead-lifecycle.service';

// `LeadLifecycleService` is the canonical owner of lead status
// transitions. Marked `@Global()` so feature modules (leads, agent,
// automation, communications) can inject it without listing
// `LeadLifecycleModule` in their own imports array.
@Global()
@Module({
  imports: [TimelineModule],
  controllers: [LeadLifecycleController],
  providers: [LeadLifecycleService, PrismaService],
  exports: [LeadLifecycleService],
})
export class LeadLifecycleModule {}

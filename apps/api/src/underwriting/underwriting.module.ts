import { Module } from '@nestjs/common';
import { UnderwritingController } from './underwriting.controller';
import { UnderwritingService } from './underwriting.service';
import { PrismaService } from '../prisma.service';
import { TimelineModule } from '../timeline/timeline.module';
import { AgentModule } from '../agent/agent.module';

@Module({
  imports: [TimelineModule, AgentModule],
  controllers: [UnderwritingController],
  providers: [UnderwritingService, PrismaService],
  exports: [UnderwritingService],
})
export class UnderwritingModule {}

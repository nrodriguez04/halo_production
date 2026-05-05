import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller';
import { LeadsService } from './leads.service';
import { PrismaService } from '../prisma.service';
import { TimelineModule } from '../timeline/timeline.module';

@Module({
  imports: [TimelineModule],
  controllers: [LeadsController],
  providers: [LeadsService, PrismaService],
  exports: [LeadsService],
})
export class LeadsModule {}


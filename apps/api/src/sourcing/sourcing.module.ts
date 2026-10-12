import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AutomationModule } from '../automation/automation.module';
import { LeadsModule } from '../leads/leads.module';
import { PrismaService } from '../prisma.service';
import { SourcingSchedulerService } from './sourcing-scheduler.service';
import { SourcingController } from './sourcing.controller';
import { SourcingService } from './sourcing.service';

// ControlPlaneService comes from the global ControlPlaneModule.
@Module({
  imports: [AuthModule, LeadsModule, AutomationModule],
  controllers: [SourcingController],
  providers: [PrismaService, SourcingService, SourcingSchedulerService],
  exports: [SourcingService],
})
export class SourcingModule {}

import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { QueuesModule } from '../queues/queues.module';
import { AlertsController } from './alerts.controller';
import { FailedJobsWatcherService } from './failed-jobs-watcher.service';
import { OpsAlertService } from './ops-alert.service';

// Global so the budget alerts in cost control and the exception filter in
// main.ts can reach OpsAlertService without importing this module.
@Global()
@Module({
  imports: [AuthModule, QueuesModule],
  controllers: [AlertsController],
  providers: [OpsAlertService, FailedJobsWatcherService],
  exports: [OpsAlertService],
})
export class AlertsModule {}

import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentAccountId } from '../auth/decorators';
import { JobsService } from './jobs.service';

@Controller('jobs')
@UseGuards(AuthGuard)
export class JobsController {
  constructor(private readonly jobsService: JobsService) {}

  @Get(':jobId')
  async getJob(@CurrentAccountId() accountId: string, @Param('jobId') jobId: string) {
    return this.jobsService.getJobRun(accountId, jobId);
  }
}

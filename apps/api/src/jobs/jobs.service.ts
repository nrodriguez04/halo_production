import { Injectable, NotFoundException } from '@nestjs/common';
import {
  JobRunEntityType,
  JobRunKind,
  JobRunStatus,
} from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class JobsService {
  constructor(private prisma: PrismaService) {}

  async createJobRun(input: {
    tenantId: string;
    kind: JobRunKind;
    entityType: JobRunEntityType;
    entityId: string;
    actorId?: string | null;
  }) {
    return this.prisma.jobRun.create({
      data: {
        tenantId: input.tenantId,
        kind: input.kind,
        entityType: input.entityType,
        entityId: input.entityId,
        actorId: input.actorId || null,
        status: JobRunStatus.QUEUED,
      },
    });
  }

  async getJobRun(tenantId: string, jobId: string) {
    const job = await this.prisma.jobRun.findFirst({
      where: {
        id: jobId,
        tenantId,
      },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    return job;
  }
}

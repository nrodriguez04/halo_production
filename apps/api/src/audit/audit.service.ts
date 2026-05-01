import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

export interface AuditEntry {
  accountId: string;
  userId?: string;
  action: string;
  resource: string;
  details?: Record<string, any>;
  ip?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private prisma: PrismaService) {}

  async log(entry: AuditEntry) {
    try {
      await this.prisma.auditLog.create({
        data: {
          accountId: entry.accountId,
          userId: entry.userId,
          action: entry.action,
          resource: entry.resource,
          details: entry.details ?? undefined,
          ip: entry.ip,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log: ${err}`);
    }
  }

  async getRecent(accountId: string, take: number = 50) {
    return this.prisma.auditLog.findMany({
      where: { accountId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}

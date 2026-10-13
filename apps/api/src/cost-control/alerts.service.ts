import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { OpsAlertService } from '../alerts/ops-alert.service';

// Evaluates whether a budget bucket has just crossed a threshold and
// emits a TimelineEvent. Email at 95+% is wired through the timeline
// processor in Phase 5; here we just record the structured event so it
// shows up in the admin UI immediately.

const THRESHOLDS = [0.5, 0.8, 0.95, 1.0] as const;

@Injectable()
export class AlertsService {
  private readonly logger = new Logger(AlertsService.name);

  constructor(
    private prisma: PrismaService,
    @Optional() private readonly ops?: OpsAlertService,
  ) {}

  /**
   * Called by `recordActual` after the bucket debit. Looks at each
   * affected bucket and emits a timeline event for any threshold the
   * debit just crossed.
   */
  async evaluate(params: {
    accountId: string;
    bucketIds: string[];
    deltaUsd: number;
  }): Promise<void> {
    if (params.bucketIds.length === 0) return;
    try {
      const buckets = await this.prisma.integrationBudgetBucket.findMany({
        where: { id: { in: params.bucketIds } },
      });
      const events: { threshold: number; bucket: (typeof buckets)[number] }[] =
        [];
      for (const b of buckets) {
        const post = b.currentSpendUsd / b.hardCapUsd;
        const pre = (b.currentSpendUsd - params.deltaUsd) / b.hardCapUsd;
        for (const t of THRESHOLDS) {
          if (pre < t && post >= t) {
            events.push({ threshold: t, bucket: b });
          }
        }
      }
      if (events.length === 0) return;
      await this.prisma.timelineEvent.createMany({
        data: events.map((e) => ({
          tenantId: params.accountId,
          entityType: 'JOB' as const,
          entityId: e.bucket.id,
          eventType: `cost_governance.${thresholdLabel(e.threshold)}_cap_crossed`,
          actorType: 'system' as const,
          payloadJson: {
            bucket: {
              scope: e.bucket.scope,
              scopeRef: e.bucket.scopeRef,
              period: e.bucket.period,
            },
            spent: e.bucket.currentSpendUsd,
            cap: e.bucket.hardCapUsd,
            ratio: e.bucket.currentSpendUsd / e.bucket.hardCapUsd,
            threshold: e.threshold,
          },
        })),
      });
      // 95% and 100% also reach the operator's alert webhook.
      for (const e of events.filter((x) => x.threshold >= 0.95)) {
        void this.ops?.send({
          title: `Budget ${e.bucket.scope}:${e.bucket.scopeRef ?? 'all'} reached ${Math.round(e.threshold * 100)}%`,
          severity: e.threshold >= 1 ? 'critical' : 'warning',
          fingerprint: `budget:${e.bucket.id}:${e.threshold}`,
          lines: [
            `$${e.bucket.currentSpendUsd.toFixed(2)} of $${e.bucket.hardCapUsd.toFixed(2)} this ${e.bucket.period}.`,
            e.threshold >= 1
              ? 'Calls against this budget are now blocked until the period resets or the cap is raised on Cost Governance.'
              : 'Calls will be blocked at 100%; raise the cap on Cost Governance if this is expected.',
          ],
        });
      }
    } catch (err) {
      this.logger.warn(`alert evaluation failed: ${err}`);
    }
  }
}

function thresholdLabel(t: number): string {
  if (t >= 1.0) return 'hard';
  if (t >= 0.95) return 'critical';
  if (t >= 0.8) return 'warning';
  return 'info';
}

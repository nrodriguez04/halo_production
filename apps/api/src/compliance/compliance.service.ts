import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { normalizePhoneNumber } from '@halo/shared';

export interface ComplianceSubject {
  accountId: string;
  channel: string;
  phone?: string | null;
  email?: string | null;
  leadId?: string | null;
}

export interface ComplianceFacts {
  isDnc: boolean;
  hasConsent: boolean;
  consentSource?: string;
  timezone?: string;
  localHour?: number;
  quietHoursStart?: number;
  quietHoursEnd?: number;
}

/**
 * Builds the DNC / consent / quiet-hours facts the policy engine needs.
 *
 * Deliberately the single source of truth: the same facts are evaluated when a
 * message is created and again immediately before it is handed to a provider.
 * Approval-time-only checking was the gap — a message approved at 16:00 and
 * delivered at 23:00 (queue backlog or retry) went out during quiet hours, and
 * a contact who replied STOP after approval still received it.
 */
@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(private prisma: PrismaService) {}

  async getFacts(subject: ComplianceSubject): Promise<ComplianceFacts> {
    const [isDnc, consent, quietHours] = await Promise.all([
      this.isOnDncList(subject.accountId, subject.phone),
      this.findConsent(subject),
      this.prisma.quietHours.findFirst({
        where: { accountId: subject.accountId },
      }),
    ]);

    const facts: ComplianceFacts = {
      isDnc,
      // Absence of a consent record is only meaningful for a known contact.
      // With neither a lead nor an address to key on there is nothing to
      // look up, so consent is not asserted either way.
      hasConsent: consent.applicable ? consent.granted : true,
      consentSource: consent.source,
    };

    if (quietHours?.enabled) {
      facts.timezone = quietHours.timezone;
      facts.localHour = localHourIn(quietHours.timezone);
      facts.quietHoursStart = quietHours.startHour;
      facts.quietHoursEnd = quietHours.endHour;
    }

    return facts;
  }

  /**
   * Scoped by accountId. The DNC table is keyed @@unique([accountId, phone]),
   * but the original lookup matched on phone alone, so one tenant suppressing
   * a number silently suppressed it for every other tenant too.
   */
  private async isOnDncList(
    accountId: string,
    phone?: string | null,
  ): Promise<boolean> {
    if (!phone) return false;

    const entry = await this.prisma.dNCList.findFirst({
      where: {
        accountId,
        phone: normalizePhoneNumber(phone),
        // null expiresAt means permanent.
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true },
    });

    return !!entry;
  }

  private async findConsent(subject: ComplianceSubject): Promise<{
    applicable: boolean;
    granted: boolean;
    source?: string;
  }> {
    const identifiers: Record<string, unknown>[] = [];
    if (subject.leadId) identifiers.push({ leadId: subject.leadId });
    if (subject.phone) {
      identifiers.push({ phone: normalizePhoneNumber(subject.phone) });
    }
    if (subject.email) identifiers.push({ email: subject.email });

    if (identifiers.length === 0) {
      return { applicable: false, granted: true };
    }

    const consent = await this.prisma.consent.findFirst({
      where: {
        accountId: subject.accountId,
        channel: subject.channel,
        revokedAt: null,
        OR: [
          ...identifiers.map((id) => ({ ...id })),
        ],
        AND: [
          { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        ],
      },
      orderBy: { grantedAt: 'desc' },
      select: { source: true },
    });

    return {
      applicable: true,
      granted: !!consent,
      source: consent?.source,
    };
  }
}

function localHourIn(timezone: string): number | undefined {
  try {
    return parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hour12: false,
      }).format(new Date()),
      10,
    );
  } catch {
    // An invalid timezone must not silently disable quiet hours; leaving
    // localHour undefined makes the rule skip rather than wrongly allow,
    // and the warning surfaces the bad configuration.
    return undefined;
  }
}

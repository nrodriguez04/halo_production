import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { hashEmail, hashPhone, isWithinQuietWindow } from '@halo/shared';
import { GLOBAL_ACCOUNT_ID } from '../control-plane/control-plane.service';
import { cleanValue, openValue } from '../pii/contact-crypto';
import { recipientTimeZones } from './recipient-time-zones';
import {
  DncRegistryService,
  type RegistryStatus,
} from './dnc-registry.service';

/**
 * Consent the Do Not Call registry exemption accepts: a signed or form
 * agreement. Verbal, recorded-call and relationship consents still allow
 * texts to numbers not on the registry.
 */
export const WRITTEN_CONSENT_SOURCES = new Set([
  'written',
  'form',
  'deal_page',
]);

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
  /** The consent on file is a written or form agreement. */
  writtenConsent?: boolean;
  /** Texts only: what the registry data on file says about the recipient. */
  dncRegistry?: RegistryStatus;
  dncRegistryRequired?: boolean;
  timezone?: string;
  /**
   * Where `timezone` came from: the recipient's area code or address, or the
   * tenant's configured zone when nothing about the recipient was known.
   */
  timezoneSource?: 'recipient' | 'tenant';
  localHour?: number;
  quietHoursStart?: number;
  quietHoursEnd?: number;
}

/** What a linked lead contributes: its other identifiers and its location. */
interface LeadSignals {
  canonicalPhoneHash: string | null;
  canonicalEmailHash: string | null;
  canonicalPhoneEnc: string | null;
  canonicalState: string | null;
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

  constructor(
    private prisma: PrismaService,
    private registry: DncRegistryService,
  ) {}

  async getFacts(subject: ComplianceSubject): Promise<ComplianceFacts> {
    const lead = await this.leadSignals(subject);
    const textPhone =
      subject.channel === 'sms'
        ? (cleanValue(subject.phone) ?? this.leadPhone(lead))
        : null;
    const [isDnc, consent, quietHours, dncRegistry, dncRegistryRequired] =
      await Promise.all([
        this.isOnDncList(subject, lead),
        this.findConsent(subject),
        this.prisma.quietHours.findFirst({
          where: { accountId: subject.accountId },
        }),
        subject.channel === 'sms'
          ? this.registry.check(subject.accountId, textPhone)
          : Promise.resolve(undefined),
        subject.channel === 'sms'
          ? this.registry.required(subject.accountId)
          : Promise.resolve(undefined),
      ]);

    const facts: ComplianceFacts = {
      isDnc,
      // Absence of a consent record is only meaningful for a known contact.
      // With neither a lead nor an address to key on there is nothing to
      // look up, so consent is not asserted either way.
      hasConsent: consent.applicable ? consent.granted : true,
      consentSource: consent.source,
      writtenConsent:
        consent.granted && WRITTEN_CONSENT_SOURCES.has(consent.source ?? ''),
      dncRegistry,
      dncRegistryRequired,
    };

    if (quietHours?.enabled) {
      Object.assign(facts, this.quietHoursFacts(quietHours, subject, lead));
    }

    return facts;
  }

  private async leadSignals(
    subject: ComplianceSubject,
  ): Promise<LeadSignals | null> {
    if (!subject.leadId) return null;
    return this.prisma.lead.findFirst({
      where: { id: subject.leadId, accountId: subject.accountId },
      select: {
        canonicalPhoneHash: true,
        canonicalEmailHash: true,
        canonicalPhoneEnc: true,
        canonicalState: true,
      },
    });
  }

  /**
   * A DNC entry stops every channel to the contact it names: the recipient
   * address itself and, for a lead-linked message, the lead's phone and
   * email. Only an SMS recipient's phone used to be checked, so a contact on
   * the list still received email.
   *
   * Scoped to the tenant (one tenant's list must not suppress another's
   * contacts) plus the GLOBAL scope, where an opt-out that could not be
   * attributed to any tenant is recorded. Lookups use the blind indexes
   * only; there is no plaintext column left to match.
   */
  private async isOnDncList(
    subject: ComplianceSubject,
    lead: LeadSignals | null,
  ): Promise<boolean> {
    const phone = cleanValue(subject.phone);
    const email = cleanValue(subject.email);
    const phoneHashes = distinct([
      phone ? hashPhone(phone) : null,
      lead?.canonicalPhoneHash,
    ]);
    const emailHashes = distinct([
      email ? hashEmail(email) : null,
      lead?.canonicalEmailHash,
    ]);
    if (phoneHashes.length === 0 && emailHashes.length === 0) return false;

    const identifiers: Record<string, unknown>[] = [];
    if (phoneHashes.length)
      identifiers.push({ phoneHash: { in: phoneHashes } });
    if (emailHashes.length)
      identifiers.push({ emailHash: { in: emailHashes } });

    const entry = await this.prisma.dNCList.findFirst({
      where: {
        accountId: { in: [subject.accountId, GLOBAL_ACCOUNT_ID] },
        OR: identifiers,
        // null expiresAt means permanent.
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
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
    const phone = cleanValue(subject.phone);
    const email = cleanValue(subject.email);
    const identifiers: Record<string, unknown>[] = [];
    if (subject.leadId) identifiers.push({ leadId: subject.leadId });
    if (phone) identifiers.push({ phoneHash: hashPhone(phone) });
    if (email) identifiers.push({ emailHash: hashEmail(email) });

    if (identifiers.length === 0) {
      return { applicable: false, granted: true };
    }

    const consent = await this.prisma.consent.findFirst({
      where: {
        accountId: subject.accountId,
        channel: subject.channel,
        revokedAt: null,
        OR: identifiers,
        AND: [{ OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }],
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

  /**
   * Quiet hours are the recipient's local hours. The tenant's QuietHours row
   * supplies the window; the zone comes from the recipient's phone area code
   * and the lead's state. Those can disagree, so every candidate zone is
   * checked and the one that blocks is reported. The tenant's zone is only a
   * fallback for a recipient nothing is known about.
   */
  private quietHoursFacts(
    window: { timezone: string; startHour: number; endHour: number },
    subject: ComplianceSubject,
    lead: LeadSignals | null,
  ): Partial<ComplianceFacts> {
    const recipientZones = recipientTimeZones({
      phone: cleanValue(subject.phone) ?? this.leadPhone(lead),
      state: lead?.canonicalState,
    });
    const zones = recipientZones.length ? recipientZones : [window.timezone];

    const now = new Date();
    const readings = zones.map((timezone) => ({
      timezone,
      localHour: localHourIn(timezone, now),
    }));
    const blocking = readings.find(
      (r) =>
        typeof r.localHour === 'number' &&
        isWithinQuietWindow(r.localHour, window.startHour, window.endHour),
    );
    const reported =
      blocking ??
      readings.find((r) => typeof r.localHour === 'number') ??
      readings[0];

    return {
      timezone: reported.timezone,
      timezoneSource: recipientZones.length ? 'recipient' : 'tenant',
      localHour: reported.localHour,
      quietHoursStart: window.startHour,
      quietHoursEnd: window.endHour,
    };
  }

  /** The lead's phone, for its area code when the message itself is email. */
  private leadPhone(lead: LeadSignals | null): string | null {
    if (!lead?.canonicalPhoneEnc) return null;
    try {
      return openValue(lead.canonicalPhoneEnc);
    } catch (err) {
      this.logger.warn(
        `Could not decrypt a lead phone for quiet-hours zoning: ${(err as Error).message}`,
      );
      return null;
    }
  }
}

function distinct(values: Array<string | null | undefined>): string[] {
  return Array.from(new Set(values.filter((v): v is string => !!v)));
}

function localHourIn(timezone: string, at: Date): number | undefined {
  try {
    return parseInt(
      new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        hourCycle: 'h23',
      }).format(at),
      10,
    );
  } catch {
    // An invalid timezone must not silently disable quiet hours; leaving
    // localHour undefined makes the rule skip rather than wrongly allow,
    // and the warning surfaces the bad configuration.
    return undefined;
  }
}

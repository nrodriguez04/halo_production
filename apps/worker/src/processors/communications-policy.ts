import * as complianceUtils from '@halo/shared';

type ComplianceLead = {
  id: string;
  canonicalPhone: string | null;
  canonicalEmail: string | null;
};

type ComplianceSubject = {
  accountId: string;
  leadId?: string | null;
  dealId?: string | null;
  channel: string;
  direction: string;
  metadata?: unknown;
};

type ComplianceFacts = {
  isDnc: boolean;
  hasConsent: boolean;
  consentSource?: string;
  timezone?: string;
  localHour?: number;
};

type WorkerComplianceDb = {
  dNCList: { findFirst(args: any): Promise<any> };
  consent: { findFirst(args: any): Promise<any> };
  quietHours: { findFirst(args: any): Promise<any> };
  lead: { findFirst(args: any): Promise<ComplianceLead | null> };
  deal: {
    findFirst(args: any): Promise<{ lead: ComplianceLead | null } | null>;
  };
};

// Recompute mutable compliance facts at send time because queued messages can
// become illegal after approval (for example, after STOP/DNC or consent revoke).
export async function getCommunicationComplianceFacts(
  db: WorkerComplianceDb,
  data: ComplianceSubject,
): Promise<ComplianceFacts> {
  const facts: ComplianceFacts = {
    isDnc: false,
    hasConsent: data.direction === 'outbound' ? false : true,
  };

  const lead = await resolveComplianceLead(db, data);
  const recipient = resolveRecipient(data, lead);

  if (data.direction === 'outbound' && recipient.phone) {
    const dnc = await db.dNCList.findFirst({
      where: {
        accountId: data.accountId,
        phone: recipient.phone,
      },
    });

    facts.isDnc = !!dnc;
  }

  const consentWhere = buildConsentWhere(data, lead, recipient);
  if (consentWhere) {
    const consent = await db.consent.findFirst({
      where: consentWhere,
      orderBy: { grantedAt: 'desc' },
    });

    facts.hasConsent = !!consent;
    facts.consentSource = consent?.source;
  }

  const quietHours = await db.quietHours.findFirst({
    where: { accountId: data.accountId },
  });

  if (quietHours?.enabled) {
    const config = {
      startHour: quietHours.startHour,
      endHour: quietHours.endHour,
      timezone: quietHours.timezone,
      enabled: true,
    };
    facts.timezone = quietHours.timezone;
    facts.localHour = getLocalHour(quietHours.timezone);
    // Preserve the existing config validation side effect.
    complianceUtils.isWithinQuietHours(config);
  }

  return facts;
}

async function resolveComplianceLead(
  db: WorkerComplianceDb,
  data: ComplianceSubject,
): Promise<ComplianceLead | null> {
  let lead: ComplianceLead | null = null;

  if (data.leadId) {
    lead = await db.lead.findFirst({
      where: { id: data.leadId, accountId: data.accountId },
      select: {
        id: true,
        canonicalPhone: true,
        canonicalEmail: true,
      },
    });
    if (!lead) {
      throw new Error(`Lead with ID ${data.leadId} not found`);
    }
  }

  if (data.dealId) {
    const deal = await db.deal.findFirst({
      where: { id: data.dealId, accountId: data.accountId },
      select: {
        lead: {
          select: {
            id: true,
            canonicalPhone: true,
            canonicalEmail: true,
          },
        },
      },
    });
    if (!deal) {
      throw new Error(`Deal with ID ${data.dealId} not found`);
    }
    if (!lead && deal.lead) {
      lead = deal.lead;
    }
  }

  return lead;
}

function resolveRecipient(
  data: ComplianceSubject,
  lead: ComplianceLead | null,
): { phone?: string; email?: string } {
  const metadata = asMetadataRecord(data.metadata);

  if (data.channel === 'sms') {
    const rawPhone =
      pickMetadataString(metadata, 'phone') ??
      pickMetadataString(metadata, 'to') ??
      lead?.canonicalPhone ??
      undefined;
    if (!rawPhone) {
      return {};
    }
    return { phone: complianceUtils.normalizePhoneNumber(rawPhone) };
  }

  if (data.channel === 'email') {
    const rawEmail =
      pickMetadataString(metadata, 'email') ??
      pickMetadataString(metadata, 'to') ??
      lead?.canonicalEmail ??
      undefined;
    if (!rawEmail) {
      return {};
    }
    return { email: rawEmail.trim().toLowerCase() };
  }

  return {};
}

function buildConsentWhere(
  data: ComplianceSubject,
  lead: ComplianceLead | null,
  recipient: { phone?: string; email?: string },
) {
  if (data.direction !== 'outbound') {
    return null;
  }

  const orClauses: Array<Record<string, unknown>> = [];

  if (data.channel === 'sms' && recipient.phone) {
    orClauses.push({ phone: recipient.phone });
    if (
      lead?.id &&
      lead.canonicalPhone &&
      complianceUtils.normalizePhoneNumber(lead.canonicalPhone) === recipient.phone
    ) {
      orClauses.push({ leadId: lead.id });
    }
  }

  if (data.channel === 'email' && recipient.email) {
    orClauses.push({ email: recipient.email });
    if (
      lead?.id &&
      lead.canonicalEmail &&
      lead.canonicalEmail.trim().toLowerCase() === recipient.email
    ) {
      orClauses.push({ leadId: lead.id });
    }
  }

  if (!orClauses.length) {
    return null;
  }

  return {
    accountId: data.accountId,
    channel: data.channel,
    revokedAt: null,
    OR: orClauses,
  };
}

function asMetadataRecord(
  metadata: ComplianceSubject['metadata'],
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return undefined;
  }
  return metadata as Record<string, unknown>;
}

function pickMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | undefined {
  const value = metadata?.[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function getLocalHour(timezone: string): number | undefined {
  try {
    const formatted = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      hour12: false,
    }).format(new Date());
    return parseInt(formatted, 10);
  } catch {
    return undefined;
  }
}

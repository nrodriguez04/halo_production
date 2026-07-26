import {
  assertPolicy,
  buildPolicyContext,
  normalizePhoneNumber,
} from '@halo/shared';
import { PrismaService } from '../../prisma.service';

interface MessagingComplianceFacts {
  isDnc: boolean;
  hasConsent: boolean;
  consentSource?: string;
  timezone?: string;
  localHour?: number;
}

interface MessagingPolicyInput {
  tenantId: string;
  dealId: string;
  channel: 'sms' | 'email';
  recipient: string;
  subject?: string;
}

interface MessagingPolicyResult {
  dealId: string;
  leadId: string | null;
  metadata: Record<string, string>;
}

const DEFAULT_CONTROL_PLANE = {
  enabled: true,
  smsEnabled: true,
  emailEnabled: true,
};

export async function assertOpenClawMessagingAllowed(
  prisma: PrismaService,
  input: MessagingPolicyInput,
): Promise<MessagingPolicyResult> {
  const deal = await prisma.deal.findFirst({
    where: { id: input.dealId, accountId: input.tenantId },
    select: { id: true, leadId: true },
  });

  if (!deal) {
    throw new Error('Deal not found');
  }

  const controlPlane =
    (await prisma.controlPlane.findFirst()) ?? DEFAULT_CONTROL_PLANE;
  const compliance = await getComplianceFacts(prisma, {
    accountId: input.tenantId,
    leadId: deal.leadId,
    channel: input.channel,
    recipient: input.recipient,
  });

  assertPolicy(
    buildPolicyContext({
      tenantId: input.tenantId,
      actorId: null,
      actorType: 'system',
      requestedAction:
        input.channel === 'sms' ? 'comms.send_sms' : 'comms.send_email',
      channel: input.channel,
      dealId: deal.id,
      leadId: deal.leadId ?? undefined,
      hasConsent: compliance.hasConsent,
      consentSource: compliance.consentSource,
      isDnc: compliance.isDnc,
      timezone: compliance.timezone,
      localHour: compliance.localHour,
      sideEffectsEnabled: controlPlane.enabled,
      messagingEnabled:
        input.channel === 'sms'
          ? controlPlane.smsEnabled
          : controlPlane.emailEnabled,
      aiEnabled: false,
    }),
  );

  const metadata =
    input.channel === 'sms'
      ? {
          to: input.recipient,
          phone: normalizePhoneNumber(input.recipient),
        }
      : {
          to: input.recipient,
          email: input.recipient,
          ...(input.subject ? { subject: input.subject } : {}),
        };

  return {
    dealId: deal.id,
    leadId: deal.leadId,
    metadata,
  };
}

async function getComplianceFacts(
  prisma: PrismaService,
  input: {
    accountId: string;
    leadId: string | null;
    channel: 'sms' | 'email';
    recipient: string;
  },
): Promise<MessagingComplianceFacts> {
  const facts: MessagingComplianceFacts = {
    isDnc: false,
    hasConsent: true,
  };

  if (input.channel === 'sms') {
    const normalizedPhone = normalizePhoneNumber(input.recipient);
    const dnc = await prisma.dNCList.findFirst({
      where: {
        phone: normalizedPhone,
      },
    });
    facts.isDnc = !!dnc;
  }

  if (input.leadId) {
    const consent = await prisma.consent.findFirst({
      where: {
        leadId: input.leadId,
        channel: input.channel,
        revokedAt: null,
      },
      orderBy: { grantedAt: 'desc' },
    });

    facts.hasConsent = !!consent;
    facts.consentSource = consent?.source;
  }

  const quietHours = await prisma.quietHours.findFirst({
    where: { accountId: input.accountId },
  });

  if (quietHours?.enabled) {
    facts.timezone = quietHours.timezone;
    facts.localHour = getLocalHour(quietHours.timezone);
  }

  return facts;
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

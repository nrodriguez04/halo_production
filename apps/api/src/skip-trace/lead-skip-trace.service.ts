import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { LeadPiiService } from '../leads/lead-pii.service';
import { maskEmail, maskPhone } from '../pii/contact-crypto';
import type { CostActor } from '../cost-control/dto/cost-intent.dto';
import { SkipTraceService } from './skip-trace.service';
import type { SkipTraceInput, SkipTraceResult } from './dto/skip-trace.dto';

/**
 * What a skip trace returns to any caller: counts and masked previews.
 * Found contacts are stored on the lead encrypted, and a user with pii:read
 * sees them in full through the lead (audited by PIIService). The route
 * used to hand every tenant user the provider's raw phones, emails and
 * payload.
 */
export interface SkipTraceSummary {
  provider: string;
  status: SkipTraceResult['status'] | 'skipped';
  reason?: string;
  costUsd: number;
  phones: Array<{
    masked: string;
    type?: string;
    confidence?: number;
    isDnc?: boolean;
  }>;
  emails: Array<{ masked: string; confidence?: number }>;
  /** Whether the first phone / email was written to the lead (empty fields only). */
  stored: { phone: boolean; email: boolean };
}

@Injectable()
export class LeadSkipTraceService {
  constructor(
    private prisma: PrismaService,
    private skipTrace: SkipTraceService,
    private pii: LeadPiiService,
  ) {}

  /**
   * Trace one lead of the tenant and keep what it finds.
   *
   * `automated` is the worker's enrichment path: it passes the lead's score
   * so cost control applies the skip-trace threshold (BLOCK_LOW_LEAD_SCORE
   * below it; an unscored lead counts as 0) and the skip_trace_pipeline
   * workflow budget. A user-initiated trace is the user's call and is not
   * score-gated.
   */
  async traceLead(params: {
    accountId: string;
    leadId: string;
    actor: CostActor;
    userId?: string;
    automated?: boolean;
    /** Address details from the user; the worker path uses the lead's own. */
    input?: Partial<Omit<SkipTraceInput, 'leadId'>>;
  }): Promise<SkipTraceSummary> {
    const lead = await this.prisma.lead.findFirst({
      where: { id: params.leadId, accountId: params.accountId },
      select: {
        id: true,
        canonicalAddress: true,
        canonicalCity: true,
        canonicalState: true,
        canonicalZip: true,
        canonicalOwner: true,
        score: true,
      },
    });
    if (!lead) {
      throw new NotFoundException(`Lead ${params.leadId} not found`);
    }

    const input: SkipTraceInput = {
      leadId: lead.id,
      propertyAddress:
        params.input?.propertyAddress ?? lead.canonicalAddress ?? '',
      ownerName: params.input?.ownerName ?? lead.canonicalOwner ?? undefined,
      ownerMailingAddress: params.input?.ownerMailingAddress,
      city: params.input?.city ?? lead.canonicalCity ?? undefined,
      state: params.input?.state ?? lead.canonicalState ?? undefined,
      zip: params.input?.zip ?? lead.canonicalZip ?? undefined,
    };
    if (!input.propertyAddress.trim()) {
      return {
        provider: 'none',
        status: 'skipped',
        reason: 'no_address',
        costUsd: 0,
        phones: [],
        emails: [],
        stored: { phone: false, email: false },
      };
    }

    const result = await this.skipTrace.appendContacts(
      input,
      {
        accountId: params.accountId,
        actor: params.actor,
        userId: params.userId,
        leadId: lead.id,
      },
      params.automated
        ? { leadScore: lead.score ?? 0, workflow: 'skip_trace_pipeline' }
        : undefined,
    );

    const stored = await this.persist(params.accountId, lead.id, result);
    return {
      provider: result.provider,
      status: result.status,
      costUsd: result.costUsd ?? 0,
      phones: result.phones.map((p) => ({
        masked: maskPhone(p.number),
        type: p.type,
        confidence: p.confidence,
        isDnc: p.isDnc,
      })),
      emails: result.emails.map((e) => ({
        masked: maskEmail(e.email),
        confidence: e.confidence,
      })),
      stored,
    };
  }

  /** Fill the lead's empty contact fields, encrypted and tenant-scoped. */
  private async persist(
    accountId: string,
    leadId: string,
    result: SkipTraceResult,
  ): Promise<{ phone: boolean; email: boolean }> {
    const stored = { phone: false, email: false };
    if (result.status === 'error') return stored;

    const phone = result.phones[0]?.number ?? null;
    const email = result.emails[0]?.email ?? null;
    if (phone) {
      const out = await this.prisma.lead.updateMany({
        where: { id: leadId, accountId, canonicalPhoneEnc: null },
        data: this.pii.protect({ phone }),
      });
      stored.phone = out.count > 0;
    }
    if (email) {
      const out = await this.prisma.lead.updateMany({
        where: { id: leadId, accountId, canonicalEmailEnc: null },
        data: this.pii.protect({ email }),
      });
      stored.email = out.count > 0;
    }
    return stored;
  }
}

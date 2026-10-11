import { Injectable, Logger } from '@nestjs/common';
import { normalizePhoneNumber } from '@halo/shared';
import { PrismaService } from '../prisma.service';
import { GLOBAL_ACCOUNT_ID } from '../control-plane/control-plane.service';
import { protectEmail, protectPhone } from '../pii/contact-crypto';

export interface OptOutRecord {
  /** Tenants the opt-out was recorded for (GLOBAL when no tenant matched). */
  accountIds: string[];
  consentsRevoked: number;
}

/**
 * Records that a contact asked to stop: a DNC entry per tenant (encrypted,
 * blind-indexed, permanent) and the matching consents revoked, so both the
 * DNC rule and the consent rule block the next send. Used by the SMS STOP
 * handler and the email unsubscribe link.
 *
 * The GLOBAL scope holds an opt-out no tenant could be matched to; every
 * tenant's DNC check reads it, so an unattributed STOP still suppresses.
 * No consents are revoked there: consents are per tenant.
 */
@Injectable()
export class OptOutService {
  private readonly logger = new Logger(OptOutService.name);

  constructor(private prisma: PrismaService) {}

  async recordPhoneOptOut(params: {
    accountIds: string[];
    phone: string;
    source: string;
    reason: string;
  }): Promise<OptOutRecord> {
    const { phoneEnc, phoneHash } = protectPhone(
      normalizePhoneNumber(params.phone.trim()),
    );
    if (!phoneEnc || !phoneHash) return { accountIds: [], consentsRevoked: 0 };

    let consentsRevoked = 0;
    for (const accountId of scopes(params.accountIds)) {
      await this.upsertDnc(
        accountId,
        { phoneEnc, phoneHash },
        { phoneHash },
        params,
      );
      // A phone opt-out covers texts and calls (both TCPA).
      const revoked =
        accountId === GLOBAL_ACCOUNT_ID
          ? 0
          : await this.revokeConsents(accountId, { phoneHash }, [
              'sms',
              'call',
            ]);
      consentsRevoked += revoked;
      await this.audit(accountId, 'sms', params.source, revoked);
    }
    return { accountIds: scopes(params.accountIds), consentsRevoked };
  }

  async recordEmailOptOut(params: {
    accountId: string;
    email: string;
    source: string;
    reason: string;
    leadId?: string | null;
  }): Promise<OptOutRecord> {
    const { emailEnc, emailHash } = protectEmail(params.email);
    if (!emailEnc || !emailHash) return { accountIds: [], consentsRevoked: 0 };

    await this.upsertDnc(
      params.accountId,
      { emailEnc, emailHash },
      { emailHash },
      params,
    );
    const revoked = await this.revokeConsents(
      params.accountId,
      { emailHash },
      ['email'],
      params.leadId,
    );
    await this.audit(params.accountId, 'email', params.source, revoked);
    return { accountIds: [params.accountId], consentsRevoked: revoked };
  }

  /**
   * One row per (tenant, contact). A repeat opt-out makes an expiring entry
   * permanent again rather than adding a duplicate.
   */
  private async upsertDnc(
    accountId: string,
    columns: Record<string, string>,
    hash: { phoneHash: string } | { emailHash: string },
    meta: { source: string; reason: string },
  ) {
    const where =
      'phoneHash' in hash
        ? { accountId_phoneHash: { accountId, phoneHash: hash.phoneHash } }
        : { accountId_emailHash: { accountId, emailHash: hash.emailHash } };
    try {
      await this.prisma.dNCList.upsert({
        where,
        create: {
          accountId,
          ...columns,
          source: meta.source,
          reason: meta.reason,
        },
        update: { expiresAt: null },
      });
    } catch (err) {
      // Two opt-outs for the same contact raced; the other one created the
      // row. Still make sure it is permanent.
      if ((err as { code?: string }).code !== 'P2002') throw err;
      await this.prisma.dNCList.updateMany({
        where: { accountId, ...hash },
        data: { expiresAt: null },
      });
    }
  }

  /**
   * Consents recorded against the contact itself, or against a lead of the
   * tenant that carries it, for the given channels.
   */
  private async revokeConsents(
    accountId: string,
    hash: { phoneHash: string } | { emailHash: string },
    channels: string[],
    leadId?: string | null,
  ): Promise<number> {
    const leads = await this.prisma.lead.findMany({
      where:
        'phoneHash' in hash
          ? { accountId, canonicalPhoneHash: hash.phoneHash }
          : { accountId, canonicalEmailHash: hash.emailHash },
      select: { id: true },
    });
    const leadIds = Array.from(
      new Set([...leads.map((l) => l.id), ...(leadId ? [leadId] : [])]),
    );
    const result = await this.prisma.consent.updateMany({
      where: {
        accountId,
        revokedAt: null,
        channel: { in: channels },
        OR: [hash, ...(leadIds.length ? [{ leadId: { in: leadIds } }] : [])],
      },
      data: { revokedAt: new Date() },
    });
    return result.count;
  }

  private async audit(
    accountId: string,
    channel: string,
    source: string,
    consentsRevoked: number,
  ) {
    try {
      await this.prisma.auditLog.create({
        data: {
          accountId,
          action: 'compliance.opt_out',
          resource: 'dnc_list',
          details: { channel, source, consentsRevoked },
        },
      });
    } catch (err) {
      // The opt-out itself is already recorded; a missing audit row must not
      // undo it or fail the webhook.
      this.logger.error(
        `Opt-out audit row not written: ${(err as Error).message}`,
      );
    }
  }
}

function scopes(accountIds: string[]): string[] {
  const unique = Array.from(new Set(accountIds.filter(Boolean)));
  return unique.length ? unique : [GLOBAL_ACCOUNT_ID];
}

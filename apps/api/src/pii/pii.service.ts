import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import {
  encryptPII,
  decryptPII,
  needsRotation,
  reEncryptPII,
} from '@halo/shared';
import type { PiiViewer } from '../auth/pii-access';
import { presentContact, type ContactRow } from '../leads/lead-pii';
import { presentBuyerContact, type BuyerContactRow } from '../buyers/buyer-pii';

type Identified = { id?: string };

@Injectable()
export class PIIService {
  private readonly logger = new Logger(PIIService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Lead rows for an API response. Contacts are masked unless the viewer
   * may reveal them, and a reveal is recorded in the audit log first. This
   * is the only path that returns unmasked lead contacts.
   */
  async presentLeads<T extends ContactRow & Identified>(
    rows: T[],
    viewer?: PiiViewer | null,
  ) {
    const reveal = await this.authorizeReveal(viewer, 'lead', rows, (r) => ({
      phone: !!r.canonicalPhoneEnc,
      email: !!r.canonicalEmailEnc,
    }));
    return rows.map((row) => presentContact(row, reveal));
  }

  async presentLead<T extends ContactRow & Identified>(
    row: T,
    viewer?: PiiViewer | null,
  ) {
    const [out] = await this.presentLeads([row], viewer);
    return out;
  }

  /** As presentLeads, for buyer rows. */
  async presentBuyers<T extends BuyerContactRow & Identified>(
    rows: T[],
    viewer?: PiiViewer | null,
  ) {
    const reveal = await this.authorizeReveal(viewer, 'buyer', rows, (r) => ({
      phone: !!r.phoneEnc,
      email: !!r.emailEnc,
    }));
    return rows.map((row) => presentBuyerContact(row, reveal));
  }

  async presentBuyer<T extends BuyerContactRow & Identified>(
    row: T,
    viewer?: PiiViewer | null,
  ) {
    const [out] = await this.presentBuyers([row], viewer);
    return out;
  }

  /**
   * True when contacts may be returned unmasked: the viewer holds pii:read
   * (or an admin role) AND the reveal was written to the audit log. Fails
   * closed: if the audit row cannot be written the caller gets masked
   * values, never an unaudited reveal.
   */
  private async authorizeReveal<T extends Identified>(
    viewer: PiiViewer | null | undefined,
    kind: 'lead' | 'buyer',
    rows: T[],
    contactsOf: (row: T) => { phone: boolean; email: boolean },
  ): Promise<boolean> {
    if (!viewer?.canReveal) return false;

    const ids: string[] = [];
    const fields = new Set<'phone' | 'email'>();
    for (const row of rows) {
      const has = contactsOf(row);
      if (has.phone) fields.add('phone');
      if (has.email) fields.add('email');
      if ((has.phone || has.email) && row.id) ids.push(row.id);
    }
    // Nothing encrypted in these rows: nothing is revealed, nothing to audit.
    if (fields.size === 0) return true;

    try {
      await this.prisma.auditLog.create({
        data: {
          accountId: viewer.accountId,
          userId: viewer.userId ?? undefined,
          action: 'pii.reveal',
          resource: ids.length === 1 ? `${kind}:${ids[0]}` : kind,
          details: { ids, fields: [...fields], count: ids.length },
        },
      });
      return true;
    } catch (err) {
      this.logger.error(
        `PII reveal for ${kind} could not be audited; returning masked values: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async encrypt(
    accountId: string,
    fieldName: string,
    plaintext: string,
    leadId?: string,
    propertyId?: string,
  ): Promise<string> {
    const envelope = encryptPII(plaintext);

    const record = await this.prisma.pIIEnvelope.create({
      data: {
        accountId,
        fieldName,
        leadId,
        propertyId,
        encryptedValue: JSON.stringify(envelope),
        keyVersion: envelope.keyVersion,
      },
    });

    return record.id;
  }

  async decrypt(envelopeId: string, actorId?: string): Promise<string> {
    const record = await this.prisma.pIIEnvelope.findUnique({
      where: { id: envelopeId },
    });

    if (!record) throw new Error('PII envelope not found');

    await this.prisma.auditLog.create({
      data: {
        accountId: record.accountId,
        action: 'pii_access',
        userId: actorId || 'system',
        resource: `PIIEnvelope:${envelopeId}`,
        details: { fieldName: record.fieldName, leadId: record.leadId },
      },
    });

    const envelope = JSON.parse(record.encryptedValue);

    if (needsRotation(envelope)) {
      const rotated = reEncryptPII(envelope);
      await this.prisma.pIIEnvelope.update({
        where: { id: envelopeId },
        data: {
          encryptedValue: JSON.stringify(rotated),
          keyVersion: rotated.keyVersion,
        },
      });
      return decryptPII(rotated);
    }

    return decryptPII(envelope);
  }

  async rotateAll(): Promise<number> {
    const currentVersion = parseInt(
      process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION || '1',
      10,
    );
    const records = await this.prisma.pIIEnvelope.findMany({
      where: { keyVersion: { lt: currentVersion } },
    });

    let rotated = 0;
    for (const record of records) {
      try {
        const envelope = JSON.parse(record.encryptedValue);
        const newEnvelope = reEncryptPII(envelope);
        await this.prisma.pIIEnvelope.update({
          where: { id: record.id },
          data: {
            encryptedValue: JSON.stringify(newEnvelope),
            keyVersion: newEnvelope.keyVersion,
          },
        });
        rotated++;
      } catch (err: any) {
        this.logger.error(
          `Failed to rotate PII envelope ${record.id}: ${err.message}`,
        );
      }
    }

    this.logger.log(`Rotated ${rotated}/${records.length} PII envelopes`);
    return rotated;
  }
}

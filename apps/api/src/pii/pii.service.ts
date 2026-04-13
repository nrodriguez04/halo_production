import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { encryptPII, decryptPII, needsRotation, reEncryptPII } from '@halo/shared';

@Injectable()
export class PIIService {
  private readonly logger = new Logger(PIIService.name);

  constructor(private prisma: PrismaService) {}

  async encrypt(accountId: string, fieldName: string, plaintext: string, leadId?: string, propertyId?: string): Promise<string> {
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
        action: 'pii_access',
        userId: actorId || 'system',
        resource: 'PIIEnvelope',
        resourceId: envelopeId,
        metadata: { fieldName: record.fieldName, leadId: record.leadId },
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
    const currentVersion = parseInt(process.env.PII_ENCRYPTION_KEY_CURRENT_VERSION || '1', 10);
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
        this.logger.error(`Failed to rotate PII envelope ${record.id}: ${err.message}`);
      }
    }

    this.logger.log(`Rotated ${rotated}/${records.length} PII envelopes`);
    return rotated;
  }
}

import { BadRequestException } from '@nestjs/common';
import type { PrismaService } from '../prisma.service';

/**
 * A document a contract-flipping record points at (the signed agreement,
 * a consent, a settlement statement) must be an active document of the same
 * tenant, attached to the deal or its lead. A record never points at a file
 * Halo does not hold, or at another deal's paperwork.
 */
export async function assertDealDocument(
  prisma: PrismaService,
  accountId: string,
  documentId: string,
  deal: { id: string; leadId: string | null },
  what: string,
): Promise<{ id: string; title: string }> {
  const doc = await prisma.document.findFirst({
    where: {
      id: documentId,
      accountId,
      status: 'active',
      OR: [
        { dealId: deal.id },
        ...(deal.leadId ? [{ leadId: deal.leadId }] : []),
      ],
    },
    select: { id: true, title: true },
  });
  if (!doc) {
    throw new BadRequestException(
      `${what}: document ${documentId} is not an active document attached to this deal. Upload it on the Documents page with the deal selected.`,
    );
  }
  return doc;
}

/** A document of the tenant attached to a buyer (proof of funds). */
export async function assertBuyerDocument(
  prisma: PrismaService,
  accountId: string,
  documentId: string,
  buyerId: string,
  what: string,
): Promise<{ id: string }> {
  const doc = await prisma.document.findFirst({
    where: { id: documentId, accountId, status: 'active', buyerId },
    select: { id: true },
  });
  if (!doc) {
    throw new BadRequestException(
      `${what}: document ${documentId} is not an active document attached to this buyer.`,
    );
  }
  return doc;
}

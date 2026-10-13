import { buyerAskingPrice, type BuyerPrice } from '@halo/shared';
import type { PrismaService } from '../prisma.service';

export interface PricedDeal {
  offerAmount?: number | null;
  mao?: number | null;
  arv?: number | null;
  repairEstimate?: number | null;
  economics?: {
    contractPrice?: number | null;
    assignmentPrice?: number | null;
    assignmentFee?: number | null;
  } | null;
}

/**
 * What buyers are asked to pay for a deal: the price a person set, else the
 * seller-side price plus the deal's or the tenant's fee (packages/shared
 * buyerAskingPrice). Anything shown or matched against buyers uses this,
 * never the offer made to the seller.
 */
export async function dealBuyerPrice(
  prisma: PrismaService,
  accountId: string,
  deal: PricedDeal,
): Promise<BuyerPrice | null> {
  const cp = await prisma.controlPlane.findUnique({
    where: { accountId },
    select: { defaultAssignmentFee: true },
  });
  return buyerAskingPrice(
    {
      assignmentPrice: deal.economics?.assignmentPrice,
      contractPrice: deal.economics?.contractPrice,
      assignmentFee: deal.economics?.assignmentFee,
      offerAmount: deal.offerAmount,
      mao: deal.mao,
      arv: deal.arv,
      repairEstimate: deal.repairEstimate,
    },
    cp?.defaultAssignmentFee,
  );
}

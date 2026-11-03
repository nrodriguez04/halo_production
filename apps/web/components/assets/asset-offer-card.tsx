'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SellerOfferForm } from '@/components/disposition/underwriting-card';
import { useApiQuery } from '@/lib/api-query';
import { rangeText, type DealUnderwriting } from '@/lib/assets';

/**
 * The offer to the seller on a land or commercial deal, bounded by its own
 * strategy's offer range (docs/asset-classes.md s5.4). The residential card,
 * with ARV, repairs and the MAO, does not apply to these deals.
 */
export function AssetOfferCard({
  dealId,
  stage,
  offerAmount,
}: {
  dealId: string;
  stage: string;
  offerAmount: number | null;
}) {
  const uw = useApiQuery<DealUnderwriting>(`/deals/${dealId}/asset-underwriting`, { retry: false });
  const u = uw.data;
  const negotiating = ['new', 'contacted', 'negotiating'].includes(stage);
  const range = rangeText(u?.offerRange ?? null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Offer to the seller</CardTitle>
        <CardDescription>
          {range
            ? `Halo's offer range for this deal is ${range}. Above it, or while the deal needs review, you give a reason and it is recorded.`
            : 'No offer range is supported yet: see what is missing above. Any offer you set needs a reason, and it is recorded.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {negotiating ? (
          <SellerOfferForm
            dealId={dealId}
            current={offerAmount}
            ceilingLabel="the top of the offer range"
            underwriting={
              u
                ? {
                    mao: u.offerRange?.high ?? null,
                    offerRange: u.offerRange,
                    recommendation: u.decision === 'pursue' ? 'offer' : u.decision === 'pass' ? 'pass' : 'needs_review',
                  }
                : null
            }
          />
        ) : (
          <p className="text-body text-muted-foreground">
            The price is in the seller contract now{offerAmount != null ? ` (last offer $${offerAmount.toLocaleString('en-US')})` : ''}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

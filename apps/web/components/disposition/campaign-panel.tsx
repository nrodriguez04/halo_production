'use client';

import { useEffect, useState } from 'react';
import { Megaphone, Pause, Play, Rocket, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/states';
import { toast } from '@/components/ui/toast';
import { useDealAction } from './use-deal-action';
import { Field } from './agreement-panel';
import { day, money, type Campaign, type Eligibility, type PricingRecommendation } from '@/lib/disposition';

const STATUS_VARIANT: Record<Campaign['status'], 'secondary' | 'success' | 'warning' | 'destructive' | 'info'> = {
  draft: 'secondary',
  active: 'success',
  paused: 'warning',
  completed: 'info',
  cancelled: 'destructive',
  expired: 'destructive',
};

const TARGET_VARIANT: Record<string, 'secondary' | 'info' | 'success' | 'warning' | 'destructive' | 'primary-soft'> = {
  selected: 'secondary',
  contacted: 'info',
  viewed: 'info',
  interested: 'primary-soft',
  offered: 'success',
  declined: 'secondary',
  opted_out: 'destructive',
  skipped: 'warning',
};

interface LaunchResult {
  launched: boolean;
  results: Array<{ buyerId: string; name: string; status: string; reason?: string }>;
}

/**
 * Preparing a campaign is free and internal; launching it is the one
 * approval for buyer outreach. The person sees the price, the floor, the
 * buyers and the exact message before approving.
 */
export function CampaignPanel({
  dealId,
  campaigns,
  pricing,
  eligibility,
  hasExecutedAgreement,
}: {
  dealId: string;
  campaigns: Campaign[];
  pricing: PricingRecommendation | null;
  eligibility: Eligibility;
  hasExecutedAgreement: boolean;
}) {
  const current = campaigns.find((c) => ['draft', 'active', 'paused'].includes(c.status)) ?? null;
  const past = campaigns.filter((c) => c !== current);
  const [askingPrice, setAskingPrice] = useState('');
  const [maxBuyers, setMaxBuyers] = useState('25');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [launchOpen, setLaunchOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const currentId = current?.id;
  const currentSubject = current?.outreachSubject;
  const currentBody = current?.outreachBody;
  const currentPrice = current?.askingPrice;
  useEffect(() => {
    setSubject(currentSubject ?? '');
    setBody(currentBody ?? '');
    setAskingPrice(currentPrice != null ? String(currentPrice) : '');
  }, [currentId, currentSubject, currentBody, currentPrice]);

  const prepare = useDealAction(
    dealId,
    () => ({
      path: `/deals/${dealId}/campaigns`,
      body: { ...(askingPrice ? { askingPrice: Number(askingPrice) } : {}), maxBuyers: Number(maxBuyers) || 25 },
    }),
    { success: 'Campaign prepared for your review', failure: 'Could not prepare a campaign' },
  );
  const update = useDealAction<Record<string, unknown>>(
    dealId,
    (input) => ({ path: `/campaigns/${current?.id}`, method: 'PATCH', body: input }),
    { success: 'Campaign updated', failure: 'Could not update the campaign' },
  );
  const launch = useDealAction<void, LaunchResult>(
    dealId,
    () => ({ path: `/campaigns/${current?.id}/launch` }),
    {
      success: (out) =>
        out.launched
          ? `Launched to ${out.results.filter((r) => r.status !== 'skipped').length} buyer(s)`
          : 'Nothing could be sent; the campaign stays a draft',
      failure: 'Could not launch',
    },
    (out) => {
      setLaunchOpen(false);
      const skipped = out.results.filter((r) => r.status !== 'approved');
      if (skipped.length) {
        toast.warning(`${skipped.length} buyer(s) not sent`, {
          description: skipped.map((r) => `${r.name}: ${r.reason ?? r.status}`).join('; '),
        });
      }
    },
  );
  const setStatus = useDealAction<{ to: 'pause' | 'resume' | 'cancel'; reason?: string }>(
    dealId,
    ({ to, reason }) => ({ path: `/campaigns/${current?.id}/${to}`, body: reason ? { reason } : {} }),
    { success: 'Campaign updated', failure: 'Could not change the campaign' },
  );

  if (!current) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Megaphone size={16} className="text-primary" aria-hidden />
              <CardTitle>Buyer campaign</CardTitle>
            </div>
            <CardDescription>
              Halo prices the contract, ranks your buyers at that price and drafts the outreach. Nothing is sent until
              you approve it.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {!hasExecutedAgreement ? (
              <p className="text-body text-muted-foreground">A campaign is prepared from an executed seller contract.</p>
            ) : (
              <>
                {pricing && <PricingSummary pricing={pricing} />}
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Asking price (blank = recommended)" htmlFor="c-price">
                    <Input id="c-price" className="w-48" inputMode="decimal" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} placeholder={pricing ? String(pricing.recommendedPrice) : ''} />
                  </Field>
                  <Field label="Up to buyers" htmlFor="c-max">
                    <Input id="c-max" className="w-24" inputMode="numeric" value={maxBuyers} onChange={(e) => setMaxBuyers(e.target.value)} />
                  </Field>
                  <Button loading={prepare.isPending} onClick={() => prepare.mutate()}>
                    Prepare campaign
                  </Button>
                </div>
                {eligibility.status !== 'eligible' && (
                  <p className="text-caption text-amber-400">
                    You can prepare it now; launching waits for the disposition gate ({eligibility.summary})
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
        <PastCampaigns campaigns={past} />
      </div>
    );
  }

  const isDraft = current.status === 'draft';
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Megaphone size={16} className="text-primary" aria-hidden />
              <CardTitle>Buyer campaign</CardTitle>
              <Badge variant={STATUS_VARIANT[current.status]}>{current.status}</Badge>
              {current.package && <Badge variant="outline">package v{current.package.version} ({current.package.status})</Badge>}
            </div>
            <div className="flex flex-wrap gap-2">
              {isDraft && (
                <Button size="sm" onClick={() => setLaunchOpen(true)} disabled={eligibility.status !== 'eligible'}>
                  <Rocket size={14} className="mr-1" aria-hidden />
                  Review and launch
                </Button>
              )}
              {current.status === 'active' && (
                <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ to: 'pause' })}>
                  <Pause size={14} className="mr-1" aria-hidden />
                  Pause
                </Button>
              )}
              {current.status === 'paused' && (
                <Button size="sm" variant="outline" onClick={() => setStatus.mutate({ to: 'resume' })}>
                  <Play size={14} className="mr-1" aria-hidden />
                  Resume
                </Button>
              )}
            </div>
          </div>
          <CardDescription>
            Asking {money(current.askingPrice)} · floor {money(current.floorPrice)}
            {current.launchedAt && ` · launched ${day(current.launchedAt)}`}
            {current.expiresAt && ` · ends ${day(current.expiresAt)}`}
            {current.endedReason && ` · ${current.endedReason}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isDraft && current.pricing && <PricingSummary pricing={current.pricing} />}
          {isDraft && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Asking price" htmlFor="c-ask">
                  <Input id="c-ask" className="w-48" inputMode="decimal" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} />
                </Field>
                <Button size="sm" variant="outline" loading={update.isPending} onClick={() => update.mutate({ askingPrice: Number(askingPrice) })}>
                  Set price
                </Button>
              </div>
              <Field label="Subject" htmlFor="c-subject">
                <Input id="c-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </Field>
              <Field label="Message" htmlFor="c-body">
                <Textarea id="c-body" rows={12} className="font-mono text-caption" value={body} onChange={(e) => setBody(e.target.value)} />
                <p className="text-caption text-muted-foreground">
                  <code>{'{{name}}'}</code>, <code>{'{{why}}'}</code> and <code>{'{{link}}'}</code> are filled in for each buyer;
                  keep <code>{'{{link}}'}</code>, it is their own deal page.
                </p>
              </Field>
              <Button size="sm" variant="outline" loading={update.isPending} onClick={() => update.mutate({ outreachSubject: subject, outreachBody: body })}>
                Save message
              </Button>
            </div>
          )}

          <div>
            <p className="mb-2 text-caption uppercase tracking-wider text-muted-foreground">
              Buyers ({current.targets.length})
            </p>
            {current.targets.length === 0 ? (
              <p className="text-body text-muted-foreground">
                No buyer fits and can be contacted. Record consent or add buyers, then prepare again.
              </p>
            ) : (
              <ul className="space-y-1.5">
                {current.targets.map((t) => (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-3 py-1.5">
                    <div className="min-w-0">
                      <span className="text-body font-medium text-foreground">
                        {t.rank}. {t.buyer.name}
                      </span>
                      <span className="ml-2 font-mono text-caption text-muted-foreground">{t.score}</span>
                      <p className="truncate text-caption text-muted-foreground">
                        {t.skipReason ?? t.match.explanation}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={TARGET_VARIANT[t.status] ?? 'secondary'}>{t.status.replace('_', ' ')}</Badge>
                      {t.followUps > 0 && <Badge variant="outline">{t.followUps} follow-up(s)</Badge>}
                      {isDraft && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Remove ${t.buyer.name}`}
                          onClick={() => update.mutate({ removeBuyerIds: [t.buyerId] })}
                        >
                          <X size={14} aria-hidden />
                        </Button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {current.status !== 'draft' && (
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Input className="max-w-sm" placeholder="Reason to end the campaign" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              <Button size="sm" variant="destructive" disabled={!cancelReason.trim()} onClick={() => setStatus.mutate({ to: 'cancel', reason: cancelReason })}>
                End campaign
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
      <PastCampaigns campaigns={past} />

      <Dialog open={launchOpen} onOpenChange={setLaunchOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Approve and launch</DialogTitle>
            <DialogDescription>
              Approving sends this message to {current.targets.length} buyer(s), each with their own link to the deal page.
              Each message is still checked for consent, do-not-contact and quiet hours on the way out.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-3">
            <p className="text-body font-medium text-foreground">{current.outreachSubject}</p>
            <pre className="max-h-72 overflow-auto whitespace-pre-wrap text-caption text-muted-foreground">{current.outreachBody}</pre>
          </div>
          <p className="text-caption text-muted-foreground">
            Asking {money(current.askingPrice)} (floor {money(current.floorPrice)}). The buyer package is approved with
            this launch.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLaunchOpen(false)}>
              Cancel
            </Button>
            <Button loading={launch.isPending} onClick={() => launch.mutate()}>
              Approve and send
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function PricingSummary({ pricing }: { pricing: PricingRecommendation }) {
  return (
    <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          ['Recommended', money(pricing.recommendedPrice)],
          ['Fee / net', `${money(pricing.recommendedFee)} / ${money(pricing.recommendedNet)}`],
          ['Floor', money(pricing.floorPrice)],
          ['Target', money(pricing.targetPrice)],
          ['Investor ceiling', money(pricing.investorCeiling)],
        ].map(([label, value]) => (
          <div key={label}>
            <p className="text-caption uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="font-mono text-body font-semibold text-foreground">{value}</p>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={pricing.demand === 'strong' ? 'success' : pricing.demand === 'none' ? 'secondary' : 'info'}>
          demand: {pricing.demand}
        </Badge>
        {pricing.spreadInsufficient && <Badge variant="destructive">spread does not clear the minimum</Badge>}
      </div>
      <ul className="list-disc space-y-0.5 pl-5 text-caption text-muted-foreground">
        {pricing.rationale.map((r, i) => (
          <li key={i}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

function PastCampaigns({ campaigns }: { campaigns: Campaign[] }) {
  if (campaigns.length === 0) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>Earlier campaigns</CardTitle>
      </CardHeader>
      <CardContent>
        {campaigns.length === 0 ? (
          <EmptyState icon={Megaphone} title="None" />
        ) : (
          <ul className="space-y-1">
            {campaigns.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-2 text-body text-muted-foreground">
                <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
                {money(c.askingPrice)} · {c.targets.length} buyer(s) · {day(c.launchedAt ?? c.createdAt)}
                {c.endedReason && ` · ${c.endedReason}`}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import { useState } from 'react';
import { HandCoins, Plus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/states';
import { useApiQuery } from '@/lib/api-query';
import { useDealAction } from './use-deal-action';
import { Field } from './agreement-panel';
import { PricingSummary } from './campaign-panel';
import {
  RECOMMENDATION_VARIANT,
  day,
  money,
  toIsoDate,
  type BuyerOffer,
  type PricingRecommendation,
} from '@/lib/disposition';

type Decision = { kind: 'counter' | 'reject' | 'accept'; offer: BuyerOffer } | null;

const OPEN = new Set(['received', 'countered']);

/**
 * Offers with Halo's recommendation on each. Every decision is a person's:
 * the buttons here are what accept, counter and reject mean, and the api
 * refuses an unqualified buyer or a sub-minimum price with the reason.
 */
export function OffersPanel({
  dealId,
  offers,
  pricing,
}: {
  dealId: string;
  offers: BuyerOffer[];
  pricing: PricingRecommendation | null;
}) {
  const [decision, setDecision] = useState<Decision>(null);
  const [recordOpen, setRecordOpen] = useState(false);
  const open = offers.filter((o) => OPEN.has(o.status));
  const closed = offers.filter((o) => !OPEN.has(o.status));

  const confirm = useDealAction<string>(
    dealId,
    (offerId) => ({ path: `/offers/${offerId}/confirm`, body: {} }),
    { success: 'Amount confirmed', failure: 'Could not confirm' },
  );

  return (
    <div className="space-y-4">
      {pricing && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Pricing</CardTitle>
            <CardDescription>From the contract price, your minimum profit and the demand actually seen. Deterministic.</CardDescription>
          </CardHeader>
          <CardContent>
            <PricingSummary pricing={pricing} />
          </CardContent>
        </Card>
      )}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <HandCoins size={16} className="text-primary" aria-hidden />
              <CardTitle>Offers</CardTitle>
              {open.length > 0 && <Badge variant="primary-soft">{open.length} open</Badge>}
            </div>
            <Button size="sm" variant="outline" onClick={() => setRecordOpen(true)}>
              <Plus size={14} className="mr-1" aria-hidden />
              Record an offer
            </Button>
          </div>
          <CardDescription>
            Offers made on the deal page are the buyer&apos;s own; offers read from email by an agent must be confirmed first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {offers.length === 0 ? (
            <EmptyState icon={HandCoins} title="No offers yet" description="They appear here from deal pages, email and what you record." />
          ) : (
            <ul className="space-y-2">
              {[...open, ...closed].map((o) => (
                <li key={o.id} className="rounded-md border border-border bg-secondary/30 px-3 py-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-h3 font-bold text-foreground">{money(o.amount)}</span>
                        <span className="text-body text-foreground">{o.buyer.name}</span>
                        <Badge variant="outline">{o.kind === 'written_offer' ? 'written' : 'indication'}</Badge>
                        <Badge variant="secondary">{o.status}</Badge>
                        {o.capturedBy === 'agent' && !o.confirmedAt && (
                          <Badge variant="warning">read by agent ({Math.round((o.captureConfidence ?? 0) * 100)}%): confirm</Badge>
                        )}
                        <Badge variant={o.buyer.pofStatus === 'verified' ? 'success' : 'warning'}>
                          funds {o.buyer.pofStatus}
                          {o.buyer.pofAmount ? ` ${money(o.buyer.pofAmount)}` : ''}
                        </Badge>
                      </div>
                      <p className="text-caption text-muted-foreground">
                        {o.source} · {day(o.createdAt)}
                        {o.earnestMoney ? ` · deposit ${money(o.earnestMoney)}` : ''}
                        {o.closeBy ? ` · close by ${day(o.closeBy)}` : ''}
                        {o.counterAmount ? ` · we countered ${money(o.counterAmount)}` : ''}
                        {o.decisionReason ? ` · ${o.decisionReason}` : ''}
                      </p>
                      {o.conditions && <p className="text-caption text-muted-foreground">Conditions: {o.conditions}</p>}
                      {o.recommendation && OPEN.has(o.status) && (
                        <div className="mt-1.5 flex flex-wrap items-start gap-2">
                          <Badge variant={RECOMMENDATION_VARIANT[o.recommendation.recommendation]}>
                            Halo recommends: {o.recommendation.recommendation}
                            {o.recommendation.counterAmount ? ` at ${money(o.recommendation.counterAmount)}` : ''}
                          </Badge>
                          <span className="text-caption text-muted-foreground">{o.recommendation.reasons.join(' ')}</span>
                        </div>
                      )}
                    </div>
                    {OPEN.has(o.status) && (
                      <div className="flex shrink-0 flex-wrap gap-1">
                        {o.capturedBy === 'agent' && !o.confirmedAt ? (
                          <Button size="sm" loading={confirm.isPending} onClick={() => confirm.mutate(o.id)}>
                            Confirm amount
                          </Button>
                        ) : (
                          <>
                            <Button size="sm" onClick={() => setDecision({ kind: 'accept', offer: o })}>
                              Accept
                            </Button>
                            <Button size="sm" variant="outline" onClick={() => setDecision({ kind: 'counter', offer: o })}>
                              Counter
                            </Button>
                          </>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => setDecision({ kind: 'reject', offer: o })}>
                          Reject
                        </Button>
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {decision && (
        <DecisionDialog dealId={dealId} decision={decision} pricing={pricing} onClose={() => setDecision(null)} />
      )}
      <RecordOfferDialog dealId={dealId} open={recordOpen} onOpenChange={setRecordOpen} />
    </div>
  );
}

function DecisionDialog({
  dealId,
  decision,
  pricing,
  onClose,
}: {
  dealId: string;
  decision: NonNullable<Decision>;
  pricing: PricingRecommendation | null;
  onClose: () => void;
}) {
  const o = decision.offer;
  const [amount, setAmount] = useState(String(o.recommendation?.counterAmount ?? pricing?.recommendedPrice ?? ''));
  const [reason, setReason] = useState('');
  const [notify, setNotify] = useState(decision.kind === 'counter');
  const [structure, setStructure] = useState<'assignment' | 'double_close'>('assignment');
  const [atCounter, setAtCounter] = useState(o.status === 'countered');
  const [deposit, setDeposit] = useState(o.earnestMoney ? String(o.earnestMoney) : '');
  const [depositDue, setDepositDue] = useState('');

  const act = useDealAction(
    dealId,
    () => {
      if (decision.kind === 'counter') {
        return { path: `/offers/${o.id}/counter`, body: { amount: Number(amount), notifyBuyer: notify, ...(reason ? { message: reason } : {}) } };
      }
      if (decision.kind === 'reject') {
        return { path: `/offers/${o.id}/reject`, body: { notifyBuyer: notify, ...(reason ? { reason } : {}) } };
      }
      return {
        path: `/offers/${o.id}/accept`,
        body: {
          structure,
          atCounter,
          ...(deposit ? { buyerDepositAmount: Number(deposit) } : {}),
          ...(depositDue ? { buyerDepositDueAt: toIsoDate(depositDue) } : {}),
          ...(reason ? { belowMinimumReason: reason } : {}),
        },
      };
    },
    {
      success:
        decision.kind === 'accept'
          ? 'Accepted: the assignment is prepared on the Closing tab'
          : decision.kind === 'counter'
            ? 'Counter recorded'
            : 'Offer rejected',
      failure: `Could not ${decision.kind}`,
    },
    onClose,
  );

  const price = atCounter && o.counterAmount ? o.counterAmount : o.amount;
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {decision.kind === 'accept' ? 'Accept' : decision.kind === 'counter' ? 'Counter' : 'Reject'} {o.buyer.name}&apos;s offer of{' '}
            {money(o.amount)}
          </DialogTitle>
          <DialogDescription>
            {decision.kind === 'accept'
              ? `Prepares an assignment at ${money(price)}. Halo checks the buyer's verified funds and your minimum profit first; nothing is binding until the assignment is signed.`
              : decision.kind === 'counter'
                ? 'Records the counter and, if you choose, emails it to the buyer through the normal compliance checks.'
                : 'Closes the offer. The buyer can be told, politely.'}
          </DialogDescription>
        </DialogHeader>
        {o.recommendation && (
          <p className="text-caption text-muted-foreground">
            Halo recommends <span className="font-medium text-foreground">{o.recommendation.recommendation}</span>:{' '}
            {o.recommendation.reasons.join(' ')}
          </p>
        )}
        {decision.kind === 'counter' && (
          <Field label="Counter at" htmlFor="d-amount">
            <Input id="d-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
        )}
        {decision.kind === 'accept' && (
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Structure" htmlFor="d-structure">
              <Select id="d-structure" value={structure} onChange={(e) => setStructure(e.target.value as 'assignment' | 'double_close')}>
                <option value="assignment">Assignment</option>
                <option value="double_close">Double close (needs a reviewed state policy)</option>
              </Select>
            </Field>
            <Field label="Buyer deposit" htmlFor="d-deposit">
              <Input id="d-deposit" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
            </Field>
            <Field label="Deposit due" htmlFor="d-deposit-due">
              <Input id="d-deposit-due" type="date" value={depositDue} onChange={(e) => setDepositDue(e.target.value)} />
            </Field>
            {o.status === 'countered' && o.counterAmount && (
              <label className="flex items-center gap-2 text-body text-foreground">
                <Checkbox checked={atCounter} onCheckedChange={(v) => setAtCounter(v === true)} />
                The buyer agreed to our counter ({money(o.counterAmount)})
              </label>
            )}
          </div>
        )}
        {decision.kind !== 'accept' && (
          <label className="flex items-center gap-2 text-body text-foreground">
            <Checkbox checked={notify} onCheckedChange={(v) => setNotify(v === true)} />
            Email the buyer
          </label>
        )}
        <Textarea
          rows={2}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={
            decision.kind === 'accept'
              ? 'Reason, only if accepting below your minimum profit'
              : decision.kind === 'counter'
                ? 'Message to the buyer (optional)'
                : 'Reason (optional)'
          }
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant={decision.kind === 'reject' ? 'destructive' : 'default'}
            disabled={decision.kind === 'counter' && !Number(amount)}
            loading={act.isPending}
            onClick={() => act.mutate()}
          >
            {decision.kind === 'accept' ? 'Accept and prepare assignment' : decision.kind === 'counter' ? 'Counter' : 'Reject'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RecordOfferDialog({
  dealId,
  open,
  onOpenChange,
}: {
  dealId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const buyers = useApiQuery<Array<{ id: string; name: string }>>('/buyers', { params: { take: 500 }, enabled: open });
  const [buyerId, setBuyerId] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<'written_offer' | 'indication'>('written_offer');
  const [source, setSource] = useState('phone');
  const [deposit, setDeposit] = useState('');
  const [conditions, setConditions] = useState('');
  const record = useDealAction(
    dealId,
    () => ({
      path: `/deals/${dealId}/offers`,
      body: {
        buyerId,
        amount: Number(amount),
        kind,
        source,
        ...(deposit ? { earnestMoney: Number(deposit) } : {}),
        ...(conditions ? { conditions } : {}),
      },
    }),
    { success: 'Offer recorded', failure: 'Could not record the offer' },
    () => onOpenChange(false),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Record an offer</DialogTitle>
          <DialogDescription>An offer a buyer made by phone, text or in person. It replaces their older open offer.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Buyer" htmlFor="r-buyer">
            <Select id="r-buyer" value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
              <option value="">Choose…</option>
              {(buyers.data ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Amount (their total price)" htmlFor="r-amount">
            <Input id="r-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Kind" htmlFor="r-kind">
            <Select id="r-kind" value={kind} onChange={(e) => setKind(e.target.value as 'written_offer' | 'indication')}>
              <option value="written_offer">Written offer</option>
              <option value="indication">Indication of interest</option>
            </Select>
          </Field>
          <Field label="Received by" htmlFor="r-source">
            <Select id="r-source" value={source} onChange={(e) => setSource(e.target.value)}>
              <option value="phone">Phone</option>
              <option value="email">Email</option>
              <option value="sms">Text</option>
              <option value="manual">Other</option>
            </Select>
          </Field>
          <Field label="Deposit offered" htmlFor="r-deposit">
            <Input id="r-deposit" inputMode="decimal" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
          </Field>
        </div>
        <Textarea rows={2} placeholder="Conditions" value={conditions} onChange={(e) => setConditions(e.target.value)} />
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!buyerId || !Number(amount)} loading={record.isPending} onClick={() => record.mutate()}>
            Record
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

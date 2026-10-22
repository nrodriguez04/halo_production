'use client';

import { useState } from 'react';
import { Brain, Calculator } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useDealAction } from './use-deal-action';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { money, type Underwriting } from '@/lib/disposition';

const FLAG_LABEL: Record<string, string> = {
  no_arv: 'No after-repair value',
  no_repairs: 'Repairs not estimated',
  mao_not_positive: 'MAO is not positive',
  no_confidence: 'No confidence recorded',
  low_confidence: 'Low confidence',
  contract_above_mao: 'Contract above MAO',
  ask_above_mao: "Seller's ask above MAO",
  downside_loss: 'Downside loses money',
  downside_below_minimum: 'Downside below minimum profit',
  below_minimum_profit: 'Below minimum profit',
};

const REC_VARIANT = { offer: 'success', pass: 'destructive', needs_review: 'warning' } as const;

interface AiResult {
  arv?: number;
  repairEstimate?: number;
  confidence?: number;
  summary?: string;
}

/**
 * Underwriting: the model's judgement (ARV, repairs, confidence) and the
 * arithmetic Halo does on it (investor max, MAO, offer range, profit,
 * downside), kept visibly apart. Only the arithmetic sets a price.
 */
export function UnderwritingCard({
  underwriting,
  ai,
  onRun,
  running,
  dealId,
  stage,
  offerAmount,
}: {
  underwriting: Underwriting | null;
  ai: AiResult | null | undefined;
  onRun: () => void;
  running: boolean;
  dealId: string;
  stage: string;
  offerAmount: number | null;
}) {
  const u = underwriting;
  const negotiating = ['new', 'contacted', 'negotiating'].includes(stage);
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Brain size={16} className="text-primary" aria-hidden />
            <CardTitle>Underwriting</CardTitle>
            {u && <Badge variant={REC_VARIANT[u.recommendation]}>{u.recommendation.replace('_', ' ')}</Badge>}
          </div>
          <Button size="sm" variant="outline" onClick={onRun} loading={running}>
            <Calculator size={14} className="mr-2" aria-hidden />
            {ai ? 'Run again' : 'Run underwriting'}
          </Button>
        </div>
        <CardDescription>
          The Underwriter estimates ARV and repairs; the MAO, offer range and profit are computed from them, never by a
          model.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Num label="ARV (estimate)" value={money(ai?.arv ?? null)} />
          <Num label="Repairs (estimate)" value={money(ai?.repairEstimate ?? null)} />
          <Num label="Confidence" value={ai?.confidence != null ? `${Math.round(ai.confidence * 100)}%` : '—'} />
          <Num label="Investor max" value={money(u?.investorMax)} />
          <Num label="MAO" value={money(u?.mao)} strong />
          <Num label="Offer range" value={u?.offerRange ? `${money(u.offerRange.low)}–${money(u.offerRange.high)}` : '—'} />
          <Num label="Expected fee" value={money(u?.expectedFee)} />
          <Num label="Expected net" value={money(u?.expectedNet)} />
        </div>
        {u && u.flags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {u.flags.map((f) => (
              <Badge key={f} variant={f.startsWith('downside') || f === 'ask_above_mao' ? 'warning' : 'destructive'}>
                {FLAG_LABEL[f] ?? f}
              </Badge>
            ))}
          </div>
        )}
        {u && u.scenarios.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Scenario</TableHead>
                <TableHead className="text-right">ARV</TableHead>
                <TableHead className="text-right">Repairs</TableHead>
                <TableHead className="text-right">Investor max</TableHead>
                <TableHead className="text-right">Our net at {money(u.plannedPurchase)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {u.scenarios.map((s) => (
                <TableRow key={s.key}>
                  <TableCell>{s.label}</TableCell>
                  <TableCell className="text-right font-mono">{money(s.arv)}</TableCell>
                  <TableCell className="text-right font-mono">{money(s.repairs)}</TableCell>
                  <TableCell className="text-right font-mono">{money(s.investorMax)}</TableCell>
                  <TableCell
                    className={`text-right font-mono ${s.net != null && s.net < 0 ? 'text-destructive' : s.clearsMinimum === false ? 'text-amber-400' : 'text-foreground'}`}
                  >
                    {money(s.net)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {u && (
          <ul className="list-disc space-y-0.5 pl-5 text-caption text-muted-foreground">
            {u.rationale.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        )}
        {ai?.summary && <p className="border-t border-border pt-3 text-body text-muted-foreground">{ai.summary}</p>}
        {negotiating && <SellerOfferForm dealId={dealId} current={offerAmount} underwriting={u} />}
      </CardContent>
    </Card>
  );
}

function Num({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-caption uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-mono text-body font-semibold ${strong ? 'text-primary' : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

/**
 * The offer to the seller, set by a person. Up to the MAO it is within
 * policy; above it, or while the numbers need review, the reason is asked
 * for and recorded. The Outreach Drafter repeats this amount, never its own.
 */
function SellerOfferForm({
  dealId,
  current,
  underwriting,
}: {
  dealId: string;
  current: number | null;
  underwriting: Underwriting | null;
}) {
  const [amount, setAmount] = useState(current != null ? String(current) : '');
  const [reason, setReason] = useState('');
  const n = Number(amount);
  const outside =
    !!n &&
    (underwriting?.mao == null || n > underwriting.mao || underwriting.recommendation === 'needs_review');
  const save = useDealAction(
    dealId,
    () => ({ path: `/deals/${dealId}/seller-offer`, body: { amount: n, ...(reason.trim() ? { reason: reason.trim() } : {}) } }),
    { success: 'Offer to the seller set', failure: 'Could not set the offer' },
    () => setReason(''),
  );
  return (
    <div className="space-y-2 border-t border-border pt-3">
      <p className="text-caption uppercase tracking-wider text-muted-foreground">
        Offer to the seller {current != null ? `(now ${money(current)})` : ''}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="w-40"
          inputMode="decimal"
          aria-label="Offer to the seller"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={underwriting?.offerRange ? String(underwriting.offerRange.low) : ''}
        />
        {outside && (
          <Input
            className="min-w-64 flex-1"
            aria-label="Reason"
            placeholder="Why offer outside the policy bounds"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        )}
        <Button size="sm" disabled={!n || (outside && reason.trim().length < 5)} loading={save.isPending} onClick={() => save.mutate()}>
          Set offer
        </Button>
      </div>
      {outside && (
        <p className="text-caption text-amber-400">
          Above the MAO or on numbers that need review: the reason is recorded with the offer.
        </p>
      )}
    </div>
  );
}

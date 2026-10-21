'use client';

import { ArrowRight, CheckCircle2, CircleAlert, CircleHelp, ListChecks, Wallet } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  ACTION_TAB,
  ELIGIBILITY_LABEL,
  ELIGIBILITY_VARIANT,
  money,
  type Eligibility,
  type NextAction,
  type Workspace,
} from '@/lib/disposition';

/** The few actions that move this deal, most urgent first. */
export function NextActionsCard({
  actions,
  onGo,
}: {
  actions: NextAction[];
  onGo: (tab: string) => void;
}) {
  return (
    <Card className="animate-fade-up">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <ListChecks size={16} className="text-primary" aria-hidden />
          <CardTitle>Next actions</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        {actions.length === 0 ? (
          <p className="text-body text-muted-foreground">Nothing is waiting on you for this deal.</p>
        ) : (
          <ol className="space-y-2">
            {actions.slice(0, 6).map((a, i) => (
              <li
                key={`${a.kind}-${i}`}
                className={cn(
                  'flex items-start justify-between gap-3 rounded-md border px-3 py-2',
                  i === 0 ? 'border-primary/40 bg-primary/5' : 'border-border bg-secondary/30',
                )}
              >
                <div className="min-w-0">
                  <p className="text-body font-medium text-foreground">{a.title}</p>
                  <p className="text-caption text-muted-foreground">{a.detail}</p>
                </div>
                {ACTION_TAB[a.kind] && (
                  <Button size="sm" variant={i === 0 ? 'default' : 'outline'} onClick={() => onGo(ACTION_TAB[a.kind])}>
                    Open
                    <ArrowRight size={14} className="ml-1" aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

const CHECK_ICON = {
  pass: <CheckCircle2 size={16} className="shrink-0 text-emerald-400" aria-label="passes" />,
  fail: <CircleAlert size={16} className="shrink-0 text-destructive" aria-label="fails" />,
  review: <CircleHelp size={16} className="shrink-0 text-amber-400" aria-label="needs review" />,
};

/** The disposition gate, check by check, with what fixes each one. */
export function EligibilityCard({ eligibility, compact }: { eligibility: Eligibility; compact?: boolean }) {
  const checks = compact ? eligibility.checks.filter((c) => c.status !== 'pass' || c.warning) : eligibility.checks;
  return (
    <Card className="animate-fade-up">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle>Disposition gate</CardTitle>
          <Badge variant={ELIGIBILITY_VARIANT[eligibility.status]}>{ELIGIBILITY_LABEL[eligibility.status]}</Badge>
        </div>
        <CardDescription>
          A contract is marketed only when every check passes. Nothing unknown is treated as permission.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {checks.length === 0 ? (
          <p className="text-body text-muted-foreground">Every check passes.</p>
        ) : (
          <ul className="space-y-2">
            {checks.map((c) => (
              <li key={c.key} className="flex items-start gap-2">
                {CHECK_ICON[c.status]}
                <div className="min-w-0">
                  <p className="text-body text-foreground">
                    <span className="font-medium">{c.label}.</span> {c.detail}
                  </p>
                  {(c.status !== 'pass' || c.warning) && c.fix && (
                    <p className="text-caption text-muted-foreground">{c.fix}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Projected and realized money, side by side and never added together. */
export function EconomicsCard({ economics }: { economics: Workspace['economics'] }) {
  const rows: Array<{ label: string; value: string; hint?: string; strong?: boolean }> = [
    { label: 'Contract price', value: money(economics.contractPrice), hint: 'What we pay the seller. Never shown to buyers.' },
    { label: 'Asking buyers', value: money(economics.askingPrice) },
    { label: 'Projected fee', value: money(economics.projectedFee), hint: 'An accepted assignment, else the recommended price.' },
    { label: 'Projected net', value: money(economics.projectedNet) },
    {
      label: 'Realized fee',
      value: economics.revenueStatus === 'realized' ? money(economics.realizedFee) : '—',
      hint:
        economics.revenueStatus === 'lost'
          ? 'The deal was lost.'
          : economics.revenueStatus === 'projected'
            ? 'Not revenue until it is received (or the closing is confirmed, by your recognition rule).'
            : undefined,
      strong: true,
    },
  ];
  return (
    <Card className="animate-fade-up">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <Wallet size={16} className="text-primary" aria-hidden />
          <CardTitle>Economics</CardTitle>
          <Badge variant={economics.revenueStatus === 'realized' ? 'success' : economics.revenueStatus === 'lost' ? 'destructive' : 'secondary'}>
            {economics.revenueStatus}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {rows.map((r) => (
            <div key={r.label} className="space-y-0.5" title={r.hint}>
              <dt className="text-caption uppercase tracking-wider text-muted-foreground">{r.label}</dt>
              <dd className={cn('font-mono text-body font-semibold', r.strong ? 'text-primary' : 'text-foreground')}>
                {r.value}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

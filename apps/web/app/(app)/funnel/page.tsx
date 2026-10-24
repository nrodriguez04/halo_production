'use client';

import { useState } from 'react';
import { Filter } from 'lucide-react';
import { useApiQuery } from '@/lib/api-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { SpendCard } from '@/components/funnel/spend-card';
import { errorText, money } from '@/lib/disposition';

type Stage = 'leads' | 'reachable' | 'contacted' | 'conversations' | 'offers' | 'contracts' | 'assignments' | 'closed';

interface Row {
  key: string;
  counts: Record<Stage, number>;
  rates: Record<Exclude<Stage, 'leads'>, number | null>;
  leadToClose: number | null;
  realizedFees: number;
  costUsd: number;
  providerCostUsd: number;
  spendUsd: number;
  costPerLead: number | null;
  costPerContract: number | null;
  costPerClose: number | null;
  feesPerLead: number | null;
  returnOnCost: number | null;
}

interface Funnel {
  from: string;
  to: string;
  stages: Array<{ key: Stage; label: string; definition: string; rateBase: Stage | null }>;
  total: Row;
  bySource: Row[];
  byState: Row[];
  unattributedCostUsd: number;
  spend: { totalUsd: number; withoutSourceUsd: number; withoutStateUsd: number };
}

const PERIODS = [30, 90, 180, 365] as const;

function pct(n: number | null): string {
  return n == null ? '—' : `${Math.round(n * 1000) / 10}%`;
}

function usd(n: number | null): string {
  if (n == null) return '—';
  return n < 100 ? `$${n.toFixed(2)}` : money(n);
}

function Kpi({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-caption uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-mono text-h3">{value}</p>
      {detail && <p className="text-caption text-muted-foreground">{detail}</p>}
    </div>
  );
}

function costTitle(r: Row): string {
  return `Provider charges ${usd(r.providerCostUsd)}, entered spend ${usd(r.spendUsd)}`;
}

function Breakdown({ title, description, rows }: { title: string; description: string; rows: Row[] }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead />
              <TableHead className="text-right">Leads</TableHead>
              <TableHead className="text-right">Reachable</TableHead>
              <TableHead className="text-right">Contacted</TableHead>
              <TableHead className="text-right">Talking</TableHead>
              <TableHead className="text-right">Offers</TableHead>
              <TableHead className="text-right">Contracts</TableHead>
              <TableHead className="text-right">Assigned</TableHead>
              <TableHead className="text-right">Closed</TableHead>
              <TableHead className="text-right">Lead → close</TableHead>
              <TableHead className="text-right">Fees</TableHead>
              <TableHead className="text-right">Cost</TableHead>
              <TableHead className="text-right">Cost / contract</TableHead>
              <TableHead className="text-right">Return</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.key}>
                <TableCell className="font-medium">{r.key.replace(/_/g, ' ')}</TableCell>
                {(['leads', 'reachable', 'contacted', 'conversations', 'offers', 'contracts', 'assignments', 'closed'] as Stage[]).map((s) => (
                  <TableCell key={s} className="text-right font-mono text-caption">
                    {r.counts[s].toLocaleString('en-US')}
                  </TableCell>
                ))}
                <TableCell className="text-right font-mono text-caption">{pct(r.leadToClose)}</TableCell>
                <TableCell className="text-right font-mono text-caption">{money(r.realizedFees)}</TableCell>
                <TableCell className="text-right font-mono text-caption" title={costTitle(r)}>
                  {usd(r.costUsd)}
                </TableCell>
                <TableCell className="text-right font-mono text-caption">{usd(r.costPerContract)}</TableCell>
                <TableCell className="text-right font-mono text-caption">{r.returnOnCost == null ? '—' : `${r.returnOnCost.toLocaleString('en-US')}×`}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * Conversion economics (docs/data-pipeline.md s5.1): leads created in the
 * period, how far each got, and what each source and state cost and earned.
 */
export default function FunnelPage() {
  const [days, setDays] = useState<(typeof PERIODS)[number]>(90);
  const [now] = useState(() => new Date());
  const from = new Date(now.getTime() - days * 86_400_000).toISOString();
  const funnel = useApiQuery<Funnel>('/analytics/funnel', { params: { from, to: now.toISOString() } });

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Conversion funnel"
        description="Leads created in the period, how far each got, and what every source and state cost and earned. Scale the channels with the best returns. Counts come from Hålo's records; nothing is estimated."
        actions={
          <Select className="w-40" value={String(days)} onChange={(e) => setDays(Number(e.target.value) as (typeof PERIODS)[number])} aria-label="Period">
            {PERIODS.map((d) => (
              <option key={d} value={d}>
                Last {d} days
              </option>
            ))}
          </Select>
        }
      />
      {funnel.isPending ? (
        <LoadingState />
      ) : funnel.isError ? (
        <ErrorState title="Could not load" description={errorText(funnel.error)} onRetry={() => funnel.refetch()} />
      ) : funnel.data.total.counts.leads === 0 && funnel.data.spend.totalUsd === 0 ? (
        <EmptyState icon={Filter} title="No leads in this period" description="Import or source leads, and the funnel fills in as they move." />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
            <Kpi label="Leads" value={funnel.data.total.counts.leads.toLocaleString('en-US')} />
            <Kpi label="Contracts" value={funnel.data.total.counts.contracts.toLocaleString('en-US')} detail={`${pct(funnel.data.total.rates.contracts)} of offers`} />
            <Kpi label="Closed" value={funnel.data.total.counts.closed.toLocaleString('en-US')} detail={`${pct(funnel.data.total.leadToClose)} of leads`} />
            <Kpi label="Realized fees" value={money(funnel.data.total.realizedFees)} detail={`${usd(funnel.data.total.feesPerLead)} per lead`} />
            <Kpi
              label="Cost"
              value={usd(funnel.data.total.costUsd)}
              detail={`${usd(funnel.data.total.costPerLead)} per lead · ${usd(funnel.data.total.providerCostUsd)} providers, ${usd(funnel.data.total.spendUsd)} entered`}
            />
            <Kpi
              label="Return on cost"
              value={funnel.data.total.returnOnCost == null ? '—' : `${funnel.data.total.returnOnCost.toLocaleString('en-US')}×`}
              detail={`plus ${usd(funnel.data.unattributedCostUsd)} of provider charges not tied to a lead`}
            />
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Stages</CardTitle>
              <CardDescription>A lead counts at every stage up to the furthest it reached. Each rate is against the stage named beside it.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {funnel.data.stages.map((s) => {
                const n = funnel.data.total.counts[s.key];
                const share = n / funnel.data.total.counts.leads;
                const rate = s.key === 'leads' ? null : funnel.data.total.rates[s.key];
                return (
                  <div key={s.key} className="grid grid-cols-[9rem_1fr_9rem] items-center gap-3" title={s.definition}>
                    <span className="text-body">{s.label}</span>
                    <div className="h-6 rounded bg-secondary">
                      <div className="flex h-6 items-center rounded bg-primary/70 px-2 font-mono text-caption text-primary-foreground" style={{ width: `${Math.max(share * 100, 0.5)}%` }}>
                        {share >= 0.08 ? n.toLocaleString('en-US') : ''}
                      </div>
                    </div>
                    <span className="text-right font-mono text-caption text-muted-foreground">
                      {share < 0.08 ? `${n.toLocaleString('en-US')} · ` : ''}
                      {rate == null ? '' : `${pct(rate)} of ${s.rateBase}`}
                    </span>
                  </div>
                );
              })}
            </CardContent>
          </Card>

          <Breakdown
            title="By source"
            description={`Where the leads came from: a source tag on each lead (CSV imports, listing imports, leads entered by hand). Older leads without one are unattributed. Cost includes the spend entered for each source${funnel.data.spend.withoutSourceUsd ? `; ${usd(funnel.data.spend.withoutSourceUsd)} names no source and is only in the total` : ''}.`}
            rows={funnel.data.bySource}
          />
          <Breakdown
            title="By state"
            description={`Where the property is.${funnel.data.spend.withoutStateUsd ? ` ${usd(funnel.data.spend.withoutStateUsd)} of entered spend names no state and is only in the total.` : ''}`}
            rows={funnel.data.byState}
          />
        </>
      )}
      <SpendCard from={from} to={now.toISOString()} sources={(funnel.data?.bySource ?? []).map((r) => r.key).filter((k) => k !== 'unattributed')} />
    </div>
  );
}

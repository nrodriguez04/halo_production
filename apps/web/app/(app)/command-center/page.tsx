'use client';

import Link from 'next/link';
import { ArrowRight, Gauge, ListChecks } from 'lucide-react';
import { useApiQuery } from '@/lib/api-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { errorText, money } from '@/lib/disposition';
import { DispositionSettingsCard } from '@/components/disposition/settings-card';

interface AttentionItem {
  kind: string;
  title: string;
  detail: string;
  priority: number;
  dealId: string;
  property: string;
  stage: string;
}

interface Portfolio {
  asOf: string;
  pipeline: {
    activeOpportunities: number;
    underContract: number;
    awaitingVerification: number;
    marketing: number;
    assigned: number;
    closed: number;
    lost: number;
  };
  disposition: {
    campaignsLaunched: number;
    buyersContacted: number;
    buyersInterested: number;
    dealsWithOffers: number;
    dealsWithAcceptedOffer: number;
    dealsClosed: number;
    offerRate: number | null;
    closeRate: number | null;
  };
  money: {
    projected: { note: string; assignmentFees: number; deals: number };
    closedAwaitingFunds: { note: string; amount: number; deals: number };
    realized: { note: string; assignmentFees: number; deals: number; averageFee: number | null };
  };
  speed: { averageDaysContractToClose: number | null; closings: number };
  failures: {
    assignmentsCancelled: number;
    buyerDefaults: number;
    closingsCancelled: number;
    contractsTerminated: number;
    campaignsExpired: number;
  };
  agents: Array<{
    agent: string;
    runs: number;
    awaiting: number;
    approved: number;
    rejected: number;
    failed: number;
    costUsd: number;
    approvalRate: number | null;
  }>;
}

const pct = (n: number | null) => (n == null ? '—' : `${Math.round(n * 100)}%`);

/**
 * What needs a person across the whole portfolio, and how the business is
 * doing. Projected and realized money are reported apart: an accepted
 * assignment is not revenue.
 */
export default function CommandCenterPage() {
  const attention = useApiQuery<AttentionItem[]>('/command-center/attention', { refetchInterval: 60_000 });
  const portfolio = useApiQuery<Portfolio>('/command-center/portfolio');

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Contract flipping"
        title="Command Center"
        description="Decisions waiting on you, then the numbers. Everything else is handled or waiting on someone else."
      />

      <Card className="animate-fade-up">
        <CardHeader>
          <div className="flex items-center gap-2">
            <ListChecks size={16} className="text-primary" aria-hidden />
            <CardTitle>Needs you</CardTitle>
            {attention.data && <Badge variant="primary-soft">{attention.data.length}</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          {attention.isPending ? (
            <LoadingState />
          ) : attention.isError ? (
            <ErrorState title="Could not load" description={errorText(attention.error)} onRetry={() => attention.refetch()} />
          ) : attention.data.length === 0 ? (
            <EmptyState icon={ListChecks} title="Nothing waiting" description="No deal needs a decision from you right now." />
          ) : (
            <ul className="space-y-2">
              {attention.data.slice(0, 40).map((a, i) => (
                <li key={`${a.dealId}-${a.kind}-${i}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-body font-medium text-foreground">{a.title}</p>
                    <p className="text-caption text-muted-foreground">
                      {a.property} · {a.stage.replace('_', ' ')} · {a.detail}
                    </p>
                  </div>
                  <Button asChild size="sm" variant={i === 0 ? 'default' : 'outline'}>
                    <Link href={`/deals/${a.dealId}`}>
                      Open deal
                      <ArrowRight size={14} className="ml-1" aria-hidden />
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {portfolio.isPending ? (
        <LoadingState />
      ) : portfolio.isError ? (
        <ErrorState title="Could not load the portfolio" description={errorText(portfolio.error)} onRetry={() => portfolio.refetch()} />
      ) : (
        <PortfolioView p={portfolio.data} />
      )}

      <DispositionSettingsCard />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="space-y-0.5" title={hint}>
      <p className="text-caption uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-mono text-h3 font-bold text-foreground">{value}</p>
    </div>
  );
}

function PortfolioView({ p }: { p: Portfolio }) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Projected</CardTitle>
            <CardDescription>{p.money.projected.note}</CardDescription>
          </CardHeader>
          <CardContent>
            <Stat label={`${p.money.projected.deals} deal(s)`} value={money(p.money.projected.assignmentFees)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Closed, awaiting funds</CardTitle>
            <CardDescription>{p.money.closedAwaitingFunds.note}</CardDescription>
          </CardHeader>
          <CardContent>
            <Stat label={`${p.money.closedAwaitingFunds.deals} deal(s)`} value={money(p.money.closedAwaitingFunds.amount)} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Realized</CardTitle>
            <CardDescription>{p.money.realized.note}</CardDescription>
          </CardHeader>
          <CardContent className="flex gap-6">
            <Stat label={`${p.money.realized.deals} deal(s)`} value={money(p.money.realized.assignmentFees)} />
            <Stat label="Average fee" value={money(p.money.realized.averageFee)} />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Gauge size={16} className="text-primary" aria-hidden />
              <CardTitle>Pipeline</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <Stat label="Opportunities" value={p.pipeline.activeOpportunities} />
            <Stat label="Under contract" value={p.pipeline.underContract} />
            <Stat label="Awaiting verification" value={p.pipeline.awaitingVerification} />
            <Stat label="Marketing" value={p.pipeline.marketing} />
            <Stat label="Assigned" value={p.pipeline.assigned} />
            <Stat label="Closed" value={p.pipeline.closed} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Disposition</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <Stat label="Campaigns" value={p.disposition.campaignsLaunched} />
            <Stat label="Buyers contacted" value={p.disposition.buyersContacted} />
            <Stat label="Interested" value={p.disposition.buyersInterested} />
            <Stat label="Offer rate" value={pct(p.disposition.offerRate)} hint="Launched campaigns that got an offer" />
            <Stat label="Close rate" value={pct(p.disposition.closeRate)} hint="Launched campaigns whose deal closed" />
            <Stat
              label="Days to close"
              value={p.speed.averageDaysContractToClose ?? '—'}
              hint={`Average from seller contract to closing, over ${p.speed.closings} closing(s)`}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>What failed</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-3 gap-4">
            <Stat label="Assignments cancelled" value={p.failures.assignmentsCancelled} />
            <Stat label="Buyer defaults" value={p.failures.buyerDefaults} />
            <Stat label="Closings cancelled" value={p.failures.closingsCancelled} />
            <Stat label="Contracts terminated" value={p.failures.contractsTerminated} />
            <Stat label="Campaigns expired" value={p.failures.campaignsExpired} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle>Agents (90 days)</CardTitle>
          </CardHeader>
          <CardContent>
            {p.agents.length === 0 ? (
              <p className="text-body text-muted-foreground">No agent runs yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Agent</TableHead>
                    <TableHead className="text-right">Runs</TableHead>
                    <TableHead className="text-right">Waiting</TableHead>
                    <TableHead className="text-right">Approval rate</TableHead>
                    <TableHead className="text-right">Failed</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.agents.map((a) => (
                    <TableRow key={a.agent}>
                      <TableCell>{a.agent.replace(/_/g, ' ')}</TableCell>
                      <TableCell className="text-right font-mono">{a.runs}</TableCell>
                      <TableCell className="text-right font-mono">{a.awaiting}</TableCell>
                      <TableCell className="text-right font-mono">{pct(a.approvalRate)}</TableCell>
                      <TableCell className="text-right font-mono">{a.failed}</TableCell>
                      <TableCell className="text-right font-mono">${a.costUsd.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

'use client';

import { useState } from 'react';
import {
  useApiQuery,
  useApiMutation,
  useQueryClient,
  apiJson,
} from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';
import { LoadingState, EmptyState, SkeletonTable } from '@/components/states';
import { cn } from '@/lib/utils';
import { RefreshCw, ShieldCheck, AlertTriangle, Activity } from 'lucide-react';

// Operator dashboard for the cost-governance system. Fetches the four
// core read endpoints and offers approval / override actions inline.
//
// All data comes from /cost-governance/* (the new CostControlController),
// which is RBAC-gated so non-admins cannot view it.

interface BudgetBucket {
  id: string;
  accountId: string;
  scope: 'global' | 'provider' | 'workflow' | 'campaign' | 'lead' | string;
  scopeRef: string;
  period: 'day' | 'week' | 'month' | string;
  hardCapUsd: number;
  softCapUsd: number | null;
  currentSpendUsd: number;
  periodResetsAt: string;
}

interface PendingDecision {
  id: string;
  reservationId: string;
  providerKey: string;
  action: string;
  estimatedCostUsd: number;
  decision: string;
  leadId: string | null;
  campaignId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

interface CostEvent {
  id: string;
  providerKey: string;
  action: string;
  decision: string;
  status: string;
  estimatedCostUsd: number;
  actualCostUsd: number | null;
  leadId: string | null;
  createdAt: string;
}

const usd = (n: number | null | undefined) =>
  n != null ? `$${n.toFixed(n < 1 ? 4 : 2)}` : '—';

function BucketRow({ b }: { b: BudgetBucket }) {
  const ratio = b.hardCapUsd > 0 ? Math.min(1, b.currentSpendUsd / b.hardCapUsd) : 0;
  const softRatio =
    b.softCapUsd && b.hardCapUsd > 0 ? b.softCapUsd / b.hardCapUsd : 0.8;
  const overSoft = ratio >= softRatio;
  const overHard = ratio >= 1;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {b.scope}
          </Badge>
          <span className="font-medium">{b.scopeRef}</span>
          <span className="text-muted-foreground text-xs">{b.period}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          <span className={cn(overHard && 'font-semibold text-destructive')}>
            {usd(b.currentSpendUsd)}
          </span>
          <span className="mx-1">/</span>
          <span>{usd(b.hardCapUsd)}</span>
        </div>
      </div>
      <div className="relative h-1.5 w-full rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            overHard
              ? 'bg-destructive'
              : overSoft
                ? 'bg-amber-500'
                : 'bg-primary',
          )}
          style={{ width: `${(ratio * 100).toFixed(1)}%` }}
        />
      </div>
    </div>
  );
}

export default function CostGovernancePage() {
  const queryClient = useQueryClient();
  const [filterDecision, setFilterDecision] = useState<string>('');

  const { data: buckets = [], isPending: bucketsPending } =
    useApiQuery<BudgetBucket[]>('/cost-governance/buckets');
  const { data: pending = [], isPending: pendingLoading } =
    useApiQuery<PendingDecision[]>('/cost-governance/decisions/pending');
  const { data: events = [], isPending: eventsPending } = useApiQuery<CostEvent[]>(
    '/cost-governance/events',
    { params: { limit: 100, ...(filterDecision ? { decision: filterDecision } : {}) } },
  );

  const approveMutation = useApiMutation<string, unknown>(
    (reservationId) =>
      apiJson(`/cost-governance/decisions/${reservationId}/approve`, {
        method: 'POST',
        body: JSON.stringify({ note: 'Approved via /admin/cost-governance' }),
      }),
    {
      onSuccess: () => {
        toast.success('Reservation approved');
        queryClient.invalidateQueries({ queryKey: ['/cost-governance/decisions/pending'] });
        queryClient.invalidateQueries({ queryKey: ['/cost-governance/events'] });
      },
      onError: (err: any) => toast.error('Approve failed', { description: err?.message }),
    },
  );

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['/cost-governance/buckets'] });
    queryClient.invalidateQueries({ queryKey: ['/cost-governance/decisions/pending'] });
    queryClient.invalidateQueries({ queryKey: ['/cost-governance/events'] });
  };

  const loading = bucketsPending || pendingLoading || eventsPending;
  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Cost Governance" />
        <LoadingState skeleton>
          <SkeletonTable rows={5} cols={4} />
        </LoadingState>
      </div>
    );
  }

  const overHardBuckets = buckets.filter((b) => b.currentSpendUsd >= b.hardCapUsd);
  const grouped = groupBuckets(buckets);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Cost Governance"
        description="Budget caps, manual approvals, and recent provider decisions."
        actions={
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw size={16} className="mr-2" />
            Refresh
          </Button>
        }
      />

      {overHardBuckets.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {overHardBuckets.length} bucket{overHardBuckets.length === 1 ? '' : 's'} over hard cap
          </AlertTitle>
          <AlertDescription>
            {overHardBuckets.map((b) => `${b.scope}/${b.scopeRef}`).join(', ')} — cost-control is
            blocking new calls until next period or manual override.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck size={16} aria-hidden /> Budget caps
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {(Object.keys(grouped) as (keyof typeof grouped)[]).map((group) => (
              <div key={group} className="space-y-3">
                <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
                  {group}
                </p>
                {grouped[group].map((b) => (
                  <BucketRow key={b.id} b={b} />
                ))}
              </div>
            ))}
            {buckets.length === 0 && (
              <p className="text-body text-muted-foreground">No budget buckets configured.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity size={16} aria-hidden /> Pending manual approvals
              {pending.length > 0 && (
                <Badge variant="secondary" className="ml-1">
                  {pending.length}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {pending.length === 0 ? (
              <p className="text-body text-muted-foreground">No reservations awaiting approval.</p>
            ) : (
              pending.map((p) => (
                <div key={p.id} className="space-y-2 rounded-md border border-border bg-secondary/40 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5">
                      <p className="text-body font-medium text-foreground">
                        {p.providerKey}{' '}
                        <span className="text-muted-foreground">/ {p.action}</span>
                      </p>
                      <p className="text-caption text-muted-foreground">
                        Est. {usd(p.estimatedCostUsd)}
                        {p.leadId ? ` · lead ${p.leadId.slice(-6)}` : ''}
                        {p.campaignId ? ` · campaign ${p.campaignId.slice(-6)}` : ''}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      loading={approveMutation.isPending}
                      onClick={() => approveMutation.mutate(p.reservationId)}
                    >
                      Approve
                    </Button>
                  </div>
                  <p className="text-caption text-muted-foreground">
                    Reserved {new Date(p.createdAt).toLocaleString()}
                  </p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>Recent decisions</CardTitle>
          <Select
            value={filterDecision}
            onChange={(e) => setFilterDecision(e.target.value)}
            className="w-56"
            aria-label="Filter by decision"
          >
            <option value="">All decisions</option>
            <option value="ALLOW">ALLOW</option>
            <option value="ALLOW_WITH_WARNING">ALLOW_WITH_WARNING</option>
            <option value="USE_CACHE">USE_CACHE</option>
            <option value="DOWNGRADE_PROVIDER">DOWNGRADE_PROVIDER</option>
            <option value="BLOCK_OVER_BUDGET">BLOCK_OVER_BUDGET</option>
            <option value="BLOCK_LOW_LEAD_SCORE">BLOCK_LOW_LEAD_SCORE</option>
            <option value="REQUIRE_MANUAL_APPROVAL">REQUIRE_MANUAL_APPROVAL</option>
            <option value="QUEUE_UNTIL_NEXT_BUDGET_PERIOD">QUEUE_UNTIL_NEXT_BUDGET_PERIOD</option>
            <option value="WORKER_DIRECT">WORKER_DIRECT</option>
          </Select>
        </CardHeader>
        <CardContent className="p-0">
          {events.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No decisions yet"
              description="When cost-control evaluates a request, it'll appear here."
              className="border-0"
            />
          ) : (
            <table className="w-full text-sm">
              <thead className="text-caption uppercase tracking-wider text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2 text-left font-medium">When</th>
                  <th className="px-4 py-2 text-left font-medium">Provider</th>
                  <th className="px-4 py-2 text-left font-medium">Action</th>
                  <th className="px-4 py-2 text-left font-medium">Decision</th>
                  <th className="px-4 py-2 text-right font-medium">Cost</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {events.map((e) => (
                  <tr
                    key={e.id}
                    className="border-b border-border/50 transition-colors duration-fast last:border-b-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-2 font-mono text-caption text-muted-foreground">
                      {new Date(e.createdAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 font-medium">{e.providerKey}</td>
                    <td className="px-4 py-2 text-muted-foreground">{e.action}</td>
                    <td className="px-4 py-2">
                      <Badge variant={decisionVariant(e.decision)} className="font-mono text-[10px]">
                        {e.decision}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-right font-mono">
                      {usd(e.actualCostUsd ?? e.estimatedCostUsd)}
                    </td>
                    <td className="px-4 py-2 text-caption text-muted-foreground">{e.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function decisionVariant(
  decision: string,
): 'default' | 'secondary' | 'destructive' | 'outline' | 'warning' {
  if (decision.startsWith('BLOCK')) return 'destructive';
  if (decision === 'REQUIRE_MANUAL_APPROVAL' || decision === 'QUEUE_UNTIL_NEXT_BUDGET_PERIOD') {
    return 'warning';
  }
  if (decision === 'USE_CACHE' || decision === 'DOWNGRADE_PROVIDER') return 'outline';
  return 'default';
}

function groupBuckets(rows: BudgetBucket[]): Record<string, BudgetBucket[]> {
  const out: Record<string, BudgetBucket[]> = {};
  const order = ['global', 'provider', 'workflow', 'campaign', 'lead'];
  for (const r of rows) {
    const key = r.scope.charAt(0).toUpperCase() + r.scope.slice(1);
    if (!out[key]) out[key] = [];
    out[key].push(r);
  }
  // Re-order keys by `order`
  const sorted: Record<string, BudgetBucket[]> = {};
  for (const k of order) {
    const upper = k.charAt(0).toUpperCase() + k.slice(1);
    if (out[upper]) sorted[upper] = out[upper];
  }
  for (const k of Object.keys(out)) if (!sorted[k]) sorted[k] = out[k];
  return sorted;
}

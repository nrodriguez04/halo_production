'use client';

import { useEffect, useState } from 'react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';
import { LoadingState, EmptyState, SkeletonTable } from '@/components/states';
import { useReducedMotion, staggerDelay } from '@/lib/motion';
import { cn } from '@/lib/utils';
import {
  RefreshCw,
  DollarSign,
  TrendingUp,
  Activity,
  AlertTriangle,
  ChevronDown,
  Loader2,
} from 'lucide-react';

interface SpendSummary {
  today: { cost: number; calls: number };
  week: { cost: number; calls: number };
  month: { cost: number; calls: number };
  projectedMonthly: number;
}

interface ProviderRow {
  provider: string;
  totalCost: number;
  callCount: number;
  avgCostPerCall: number;
  avgDurationMs: number;
}

interface DailyRow {
  day: string;
  provider: string;
  cost: number;
  calls: number;
}

interface EndpointRow {
  endpoint: string;
  totalCost: number;
  callCount: number;
  avgCostPerCall: number;
  avgDurationMs: number;
}

interface HealthForCap {
  controlPlane?: { apiDailyCostCap?: number };
  apiSpend?: { cap?: number };
}

const usd = (n: number | null | undefined) => (n != null ? `$${n.toFixed(2)}` : '—');

const PROVIDER_COLORS: Record<string, string> = {
  attom: 'bg-blue-500',
  propertyradar: 'bg-violet-500',
  google_geocoding: 'bg-emerald-500',
  rentcast: 'bg-amber-500',
  twilio: 'bg-red-500',
  sendgrid: 'bg-cyan-500',
  openai: 'bg-pink-500',
};

const PROVIDER_LABELS: Record<string, string> = {
  attom: 'ATTOM',
  propertyradar: 'PropertyRadar',
  google_geocoding: 'Google Geocoding',
  rentcast: 'RentCast',
  twilio: 'Twilio',
  sendgrid: 'SendGrid',
  openai: 'OpenAI',
};

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  alert,
  index = 0,
  reduced = false,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof DollarSign;
  alert?: boolean;
  index?: number;
  reduced?: boolean;
}) {
  return (
    <Card
      variant="interactive"
      className={cn('animate-fade-up', alert && 'border-destructive/50')}
      style={{ animationDelay: staggerDelay(index, reduced) }}
    >
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-caption font-medium uppercase tracking-wider text-muted-foreground">
              {label}
            </p>
            <p
              className={cn(
                'text-h1 font-bold tracking-tight',
                alert ? 'text-destructive' : 'text-foreground',
              )}
            >
              {value}
            </p>
            {sub && <p className="text-caption text-muted-foreground">{sub}</p>}
          </div>
          <div className={cn('rounded-md p-2', alert ? 'bg-destructive/10' : 'bg-primary/10')}>
            <Icon size={18} className={alert ? 'text-destructive' : 'text-primary'} aria-hidden />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ApiSpendPage() {
  const queryClient = useQueryClient();
  const reduced = useReducedMotion();

  const { data: summary, isPending: summaryPending } =
    useApiQuery<SpendSummary>('/analytics/api-spend');
  const { data: providers = [], isPending: providersPending } = useApiQuery<ProviderRow[]>(
    '/analytics/api-spend/by-provider',
  );
  const { data: dailyTrend = [], isPending: trendPending } = useApiQuery<DailyRow[]>(
    '/analytics/api-spend/daily-trend',
    { params: { days: 30 } },
  );
  const { data: health, isPending: healthPending } = useApiQuery<HealthForCap>('/health/ready', {
    retry: 0,
  });

  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [capInput, setCapInput] = useState('');

  const { data: endpointData = [], isFetching: endpointLoading } = useApiQuery<EndpointRow[]>(
    '/analytics/api-spend/endpoint-breakdown',
    {
      enabled: !!expandedProvider,
      params: { provider: expandedProvider ?? undefined },
    },
  );

  const apiCap =
    typeof health?.controlPlane?.apiDailyCostCap === 'number'
      ? health.controlPlane.apiDailyCostCap
      : typeof health?.apiSpend?.cap === 'number'
        ? health.apiSpend.cap
        : 50;

  useEffect(() => {
    if (apiCap !== undefined && capInput === '') setCapInput(String(apiCap));
  }, [apiCap, capInput]);

  const saveCapMutation = useApiMutation<number, unknown>(
    (val) =>
      apiJson('/control-plane', {
        method: 'PUT',
        body: JSON.stringify({ apiDailyCostCap: val }),
      }),
    {
      onSuccess: () => {
        toast.success('API cap saved');
        queryClient.invalidateQueries({ queryKey: ['/health/ready'] });
        queryClient.invalidateQueries({ queryKey: ['/control-plane'] });
      },
      onError: (err: any) =>
        toast.error('Could not save cap', { description: err?.message ?? 'Unknown error' }),
    },
  );

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['/analytics/api-spend'] });
    queryClient.invalidateQueries({ queryKey: ['/analytics/api-spend/by-provider'] });
    queryClient.invalidateQueries({ queryKey: ['/analytics/api-spend/daily-trend'] });
    queryClient.invalidateQueries({ queryKey: ['/health/ready'] });
  };

  const handleSaveCap = () => {
    const val = parseFloat(capInput);
    if (isNaN(val) || val < 0) {
      toast.error('Enter a valid non-negative number');
      return;
    }
    saveCapMutation.mutate(val);
  };

  const toggleProvider = (provider: string) => {
    setExpandedProvider((prev) => (prev === provider ? null : provider));
  };

  const loading = summaryPending || providersPending || trendPending || healthPending;
  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="API Spend" />
        <LoadingState skeleton>
          <SkeletonTable rows={5} cols={4} />
        </LoadingState>
      </div>
    );
  }

  const todaySpend = summary?.today.cost ?? 0;
  const capPct = apiCap > 0 ? Math.min(100, (todaySpend / apiCap) * 100) : 0;
  const isOverCap = todaySpend >= apiCap;
  const totalProviderCost = providers.reduce((s, p) => s + p.totalCost, 0);

  const dailyAggregated = dailyTrend.reduce(
    (acc, row) => {
      const existing = acc.find((d) => d.day === row.day);
      if (existing) {
        existing.cost += row.cost;
        existing.calls += row.calls;
      } else {
        acc.push({ day: row.day, cost: row.cost, calls: row.calls });
      }
      return acc;
    },
    [] as { day: string; cost: number; calls: number }[],
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="API Spend"
        description="Costs across every external API integration."
        actions={
          <Button variant="outline" size="sm" onClick={refreshAll}>
            <RefreshCw size={16} className="mr-2" />
            Refresh
          </Button>
        }
      />

      {isOverCap && (
        <Alert variant="destructive">
          <AlertTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            Daily API cap exceeded
          </AlertTitle>
          <AlertDescription>
            Today: {usd(todaySpend)} / Cap: {usd(apiCap)} — new external API calls may be blocked.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          index={0}
          reduced={reduced}
          label="Today"
          value={usd(summary?.today.cost)}
          sub={`${summary?.today.calls ?? 0} calls`}
          icon={DollarSign}
          alert={isOverCap}
        />
        <StatCard
          index={1}
          reduced={reduced}
          label="7-Day"
          value={usd(summary?.week.cost)}
          sub={`${summary?.week.calls ?? 0} calls`}
          icon={Activity}
        />
        <StatCard
          index={2}
          reduced={reduced}
          label="30-Day"
          value={usd(summary?.month.cost)}
          sub={`${summary?.month.calls ?? 0} calls`}
          icon={TrendingUp}
        />
        <StatCard
          index={3}
          reduced={reduced}
          label="Projected Monthly"
          value={usd(summary?.projectedMonthly)}
          sub="Based on 30-day avg"
          icon={TrendingUp}
        />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Daily API Spend Cap</CardTitle>
            <Badge variant={isOverCap ? 'destructive' : 'success'}>
              {usd(todaySpend)} / {usd(apiCap)}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-slow ease-out-expo',
                capPct > 90 ? 'bg-destructive' : capPct > 60 ? 'bg-amber-500' : 'bg-primary',
              )}
              style={{ width: `${capPct}%` }}
            />
          </div>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1">
              <label htmlFor="api-cap" className="text-caption font-medium text-muted-foreground">
                Cap (USD / day)
              </label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body text-muted-foreground">
                  $
                </span>
                <Input
                  id="api-cap"
                  type="number"
                  min="0"
                  step="5"
                  value={capInput}
                  onChange={(e) => setCapInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSaveCap()}
                  className="pl-7 font-mono"
                />
              </div>
            </div>
            <Button size="sm" loading={saveCapMutation.isPending} onClick={handleSaveCap}>
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Spend by Provider (30 days)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {totalProviderCost > 0 && (
            <div className="space-y-2">
              <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
                {providers.map((p) => {
                  const w = (p.totalCost / totalProviderCost) * 100;
                  if (w === 0) return null;
                  return (
                    <div
                      key={p.provider}
                      className={cn(
                        'h-full transition-[width] duration-slow ease-out-expo',
                        PROVIDER_COLORS[p.provider] || 'bg-zinc-400',
                      )}
                      style={{ width: `${w}%` }}
                      title={`${PROVIDER_LABELS[p.provider] || p.provider}: ${usd(p.totalCost)}`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {providers.map((p) => (
                  <div
                    key={p.provider}
                    className="flex items-center gap-1.5 text-caption text-muted-foreground"
                  >
                    <span
                      className={cn(
                        'inline-block h-2 w-2 rounded-full',
                        PROVIDER_COLORS[p.provider] || 'bg-zinc-400',
                      )}
                      aria-hidden
                    />
                    {PROVIDER_LABELS[p.provider] || p.provider}
                  </div>
                ))}
              </div>
            </div>
          )}

          {providers.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title="No API spend yet"
              description="Provider rows appear here once external API calls are recorded."
            />
          ) : (
            <div className="space-y-2">
              {[...providers]
                .sort((a, b) => b.totalCost - a.totalCost)
                .map((p) => {
                  const expanded = expandedProvider === p.provider;
                  return (
                    <div key={p.provider}>
                      <button
                        onClick={() => toggleProvider(p.provider)}
                        aria-expanded={expanded}
                        className={cn(
                          'flex w-full items-center justify-between rounded-md border border-border bg-secondary/40 p-3 text-left',
                          'transition-colors duration-fast hover:bg-secondary/70',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={cn(
                              'inline-block h-3 w-3 rounded-full',
                              PROVIDER_COLORS[p.provider] || 'bg-zinc-400',
                            )}
                            aria-hidden
                          />
                          <div>
                            <p className="text-body font-medium text-foreground">
                              {PROVIDER_LABELS[p.provider] || p.provider}
                            </p>
                            <p className="text-caption text-muted-foreground">
                              {p.callCount} calls · avg {usd(p.avgCostPerCall)}/call
                              {p.avgDurationMs > 0 && ` · ${Math.round(p.avgDurationMs)}ms avg`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <p className="font-mono text-body font-semibold text-foreground">
                            {usd(p.totalCost)}
                          </p>
                          <ChevronDown
                            size={14}
                            className={cn(
                              'text-muted-foreground transition-transform duration-fast ease-out-expo',
                              expanded && 'rotate-180',
                            )}
                            aria-hidden
                          />
                        </div>
                      </button>

                      {expanded && (
                        <div className="ml-6 mt-1 space-y-1 animate-fade-up">
                          {endpointLoading ? (
                            <div className="flex items-center gap-2 p-2 text-caption text-muted-foreground">
                              <Loader2 size={12} className="animate-spin" /> Loading…
                            </div>
                          ) : endpointData.length === 0 ? (
                            <p className="p-2 text-caption text-muted-foreground">
                              No endpoint data
                            </p>
                          ) : (
                            endpointData.map((ep) => (
                              <div
                                key={ep.endpoint}
                                className="flex items-center justify-between rounded bg-muted/50 p-2 text-caption"
                              >
                                <div>
                                  <p className="font-mono text-foreground">{ep.endpoint}</p>
                                  <p className="text-muted-foreground">
                                    {ep.callCount} calls · avg {usd(ep.avgCostPerCall)}
                                  </p>
                                </div>
                                <p className="font-mono font-semibold text-foreground">
                                  {usd(ep.totalCost)}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </CardContent>
      </Card>

      {dailyAggregated.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Daily Spend (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {dailyAggregated.slice(-14).map((d) => {
                const maxCost = Math.max(...dailyAggregated.map((x) => x.cost), 1);
                const w = (d.cost / maxCost) * 100;
                return (
                  <div key={d.day} className="flex items-center gap-3">
                    <span className="w-20 shrink-0 text-caption text-muted-foreground">
                      {new Date(d.day + 'T00:00').toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                    <div className="h-5 flex-1 overflow-hidden rounded-sm bg-secondary">
                      <div
                        className={cn(
                          'h-full rounded-sm transition-[width] duration-slow ease-out-expo',
                          d.cost > apiCap ? 'bg-destructive' : 'bg-primary',
                        )}
                        style={{ width: `${Math.max(w, 1)}%` }}
                      />
                    </div>
                    <span className="w-16 text-right font-mono text-caption text-foreground">
                      {usd(d.cost)}
                    </span>
                    <span className="w-14 text-right text-caption text-muted-foreground">
                      {d.calls} calls
                    </span>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

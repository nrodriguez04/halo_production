'use client';

import { useEffect, useState } from 'react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  RefreshCw,
  DollarSign,
  TrendingUp,
  Activity,
  AlertTriangle,
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
}: {
  label: string;
  value: string;
  sub?: string;
  icon: typeof DollarSign;
  alert?: boolean;
}) {
  return (
    <Card className={alert ? 'border-destructive/50' : undefined}>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className={cn('text-2xl font-bold', alert ? 'text-destructive' : 'text-foreground')}>{value}</p>
            {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
          </div>
          <div className={cn('rounded-md p-2', alert ? 'bg-destructive/10' : 'bg-primary/10')}>
            <Icon size={18} className={alert ? 'text-destructive' : 'text-primary'} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function ApiSpendPage() {
  const queryClient = useQueryClient();

  const { data: summary, isPending: summaryPending } = useApiQuery<SpendSummary>('/analytics/api-spend');
  const { data: providers = [], isPending: providersPending } =
    useApiQuery<ProviderRow[]>('/analytics/api-spend/by-provider');
  const { data: dailyTrend = [], isPending: trendPending } =
    useApiQuery<DailyRow[]>('/analytics/api-spend/daily-trend', { params: { days: 30 } });
  const { data: health, isPending: healthPending } =
    useApiQuery<HealthForCap>('/health/ready', { retry: 0 });

  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [capInput, setCapInput] = useState('');

  // Endpoint breakdown is fetched lazily when a provider is expanded.
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
    (val) => apiJson('/control-plane', { method: 'PUT', body: JSON.stringify({ apiDailyCostCap: val }) }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/health/ready'] });
        queryClient.invalidateQueries({ queryKey: ['/control-plane'] });
      },
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
    if (isNaN(val) || val < 0) return;
    saveCapMutation.mutate(val);
  };

  const toggleProvider = (provider: string) => {
    setExpandedProvider((prev) => (prev === provider ? null : provider));
  };

  const loading = summaryPending || providersPending || trendPending || healthPending;
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 size={20} className="mr-2 animate-spin" />
        Loading API spend data...
      </div>
    );
  }

  const todaySpend = summary?.today.cost ?? 0;
  const capPct = apiCap > 0 ? Math.min(100, (todaySpend / apiCap) * 100) : 0;
  const isOverCap = todaySpend >= apiCap;
  const totalProviderCost = providers.reduce((s, p) => s + p.totalCost, 0);

  const last7days = dailyTrend.reduce(
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
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">API Spend Monitor</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Track costs across all external API integrations
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll}>
          <RefreshCw size={16} className="mr-2" />
          Refresh
        </Button>
      </div>

      {isOverCap && (
        <div className="rounded-lg border-2 border-destructive bg-destructive/10 px-6 py-4 flex items-center gap-3">
          <AlertTriangle className="text-destructive shrink-0" size={20} />
          <div>
            <p className="font-semibold text-destructive">Daily API spend cap exceeded</p>
            <p className="text-sm text-destructive/80">
              Today: {usd(todaySpend)} / Cap: {usd(apiCap)} — new external API calls may be blocked.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Today" value={usd(summary?.today.cost)} sub={`${summary?.today.calls ?? 0} calls`} icon={DollarSign} alert={isOverCap} />
        <StatCard label="7-Day" value={usd(summary?.week.cost)} sub={`${summary?.week.calls ?? 0} calls`} icon={Activity} />
        <StatCard label="30-Day" value={usd(summary?.month.cost)} sub={`${summary?.month.calls ?? 0} calls`} icon={TrendingUp} />
        <StatCard label="Projected Monthly" value={usd(summary?.projectedMonthly)} sub="Based on 30-day avg" icon={TrendingUp} />
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
          <div className="w-full bg-secondary rounded-full h-2">
            <div
              className={cn(
                'h-2 rounded-full transition-all',
                capPct > 90 ? 'bg-destructive' : capPct > 60 ? 'bg-amber-500' : 'bg-primary',
              )}
              style={{ width: `${capPct}%` }}
            />
          </div>
          <div className="flex gap-2 items-end">
            <div className="space-y-1 flex-1">
              <label className="text-sm font-medium text-muted-foreground">
                Cap (USD / day)
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <input
                  type="number"
                  min="0"
                  step="5"
                  value={capInput}
                  onChange={(e) => setCapInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCap(); }}
                  className={cn(
                    'w-full h-9 rounded-md border border-input bg-background pl-7 pr-3 text-sm',
                    'text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  )}
                />
              </div>
            </div>
            <Button size="sm" onClick={handleSaveCap} disabled={saveCapMutation.isPending}>
              {saveCapMutation.isPending ? 'Saving...' : 'Save'}
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
                      className={cn('h-full', PROVIDER_COLORS[p.provider] || 'bg-zinc-400')}
                      style={{ width: `${w}%` }}
                      title={`${PROVIDER_LABELS[p.provider] || p.provider}: ${usd(p.totalCost)}`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {providers.map((p) => (
                  <div key={p.provider} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className={cn('inline-block h-2 w-2 rounded-full', PROVIDER_COLORS[p.provider] || 'bg-zinc-400')} />
                    {PROVIDER_LABELS[p.provider] || p.provider}
                  </div>
                ))}
              </div>
            </div>
          )}

          {providers.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No API spend data yet</p>
          ) : (
            <div className="space-y-2">
              {[...providers]
                .sort((a, b) => b.totalCost - a.totalCost)
                .map((p) => (
                  <div key={p.provider}>
                    <button
                      onClick={() => toggleProvider(p.provider)}
                      className="w-full flex items-center justify-between p-3 rounded-md bg-secondary hover:bg-secondary/80 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className={cn('inline-block h-3 w-3 rounded-full', PROVIDER_COLORS[p.provider] || 'bg-zinc-400')} />
                        <div>
                          <p className="text-sm font-medium text-foreground">
                            {PROVIDER_LABELS[p.provider] || p.provider}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {p.callCount} calls &middot; avg {usd(p.avgCostPerCall)}/call
                            {p.avgDurationMs > 0 && ` · ${Math.round(p.avgDurationMs)}ms avg`}
                          </p>
                        </div>
                      </div>
                      <p className="text-sm font-semibold text-foreground">{usd(p.totalCost)}</p>
                    </button>

                    {expandedProvider === p.provider && (
                      <div className="ml-6 mt-1 mb-2 space-y-1">
                        {endpointLoading ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
                            <Loader2 size={12} className="animate-spin" /> Loading...
                          </div>
                        ) : endpointData.length === 0 ? (
                          <p className="text-xs text-muted-foreground p-2">No endpoint data</p>
                        ) : (
                          endpointData.map((ep) => (
                            <div
                              key={ep.endpoint}
                              className="flex items-center justify-between p-2 rounded bg-muted/50 text-xs"
                            >
                              <div>
                                <p className="font-mono text-foreground">{ep.endpoint}</p>
                                <p className="text-muted-foreground">
                                  {ep.callCount} calls &middot; avg {usd(ep.avgCostPerCall)}
                                </p>
                              </div>
                              <p className="font-semibold text-foreground">{usd(ep.totalCost)}</p>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          )}
        </CardContent>
      </Card>

      {last7days.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Daily Spend (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {last7days.slice(-14).map((d) => {
                const maxCost = Math.max(...last7days.map((x) => x.cost), 1);
                const w = (d.cost / maxCost) * 100;
                return (
                  <div key={d.day} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-20 shrink-0">
                      {new Date(d.day + 'T00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    </span>
                    <div className="flex-1 h-5 bg-secondary rounded-sm overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-sm transition-all',
                          d.cost > apiCap ? 'bg-destructive' : 'bg-primary',
                        )}
                        style={{ width: `${Math.max(w, 1)}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-foreground w-16 text-right">{usd(d.cost)}</span>
                    <span className="text-xs text-muted-foreground w-14 text-right">{d.calls} calls</span>
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

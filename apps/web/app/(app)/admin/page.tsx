'use client';

import { useEffect, useState } from 'react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ControlPlane {
  enabled: boolean;
  smsEnabled: boolean;
  emailEnabled: boolean;
  docusignEnabled: boolean;
  externalDataEnabled: boolean;
  aiEnabled: boolean;
  aiDailyCostCap: number;
}

interface HealthData {
  status: string;
  database: { status: string } | string;
  redis: { status: string } | string;
  controlPlane?: ControlPlane;
  aiCost?: {
    today: string;
    cap: number;
    remaining: string;
    status: string;
  };
}

function Toggle({ enabled, onToggle, label, disabled }: { enabled: boolean; onToggle: () => void; label: string; disabled?: boolean }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-md bg-secondary">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <button
        onClick={onToggle}
        disabled={disabled}
        className={cn(
          'relative w-11 h-6 rounded-full transition-colors disabled:opacity-50',
          enabled ? 'bg-primary' : 'bg-muted',
        )}
      >
        <span
          className={cn(
            'block w-4 h-4 rounded-full transition-transform absolute top-1',
            enabled ? 'translate-x-6 bg-primary-foreground' : 'translate-x-1 bg-foreground',
          )}
        />
      </button>
    </div>
  );
}

function resolveStatus(field: { status: string } | string | undefined): string {
  if (!field) return 'unknown';
  if (typeof field === 'string') return field;
  return field.status ?? 'unknown';
}

export default function AdminPage() {
  const queryClient = useQueryClient();

  // Try /health/ready first, fallback to /health (matches old dual-fetch behavior).
  // We still surface partial data even if one endpoint is down.
  const { data: health } = useApiQuery<HealthData>('/health/ready', {
    retry: 0,
  });
  const { data: healthFallback } = useApiQuery<HealthData>('/health', {
    enabled: !health,
    retry: 0,
  });
  const effectiveHealth = health ?? healthFallback ?? null;

  const { data: controlPlane, isPending: cpPending } = useApiQuery<ControlPlane>('/control-plane');

  const [costCapInput, setCostCapInput] = useState('');
  useEffect(() => {
    if (controlPlane) setCostCapInput(String(controlPlane.aiDailyCostCap ?? 2));
  }, [controlPlane]);

  const updateMutation = useApiMutation<Partial<ControlPlane>, ControlPlane>(
    (updates) =>
      apiJson<ControlPlane>('/control-plane', {
        method: 'PUT',
        body: JSON.stringify(updates),
      }),
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/control-plane'] });
        queryClient.invalidateQueries({ queryKey: ['/health/ready'] });
        queryClient.invalidateQueries({ queryKey: ['/health'] });
      },
    },
  );

  const update = (updates: Partial<ControlPlane>) => updateMutation.mutate(updates);

  const handleSaveCostCap = () => {
    const val = parseFloat(costCapInput);
    if (isNaN(val) || val < 0) return;
    update({ aiDailyCostCap: val });
  };

  if (cpPending && !effectiveHealth) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Loading admin dashboard...
      </div>
    );
  }

  const dbStatus = resolveStatus(effectiveHealth?.database);
  const redisStatus = resolveStatus(effectiveHealth?.redis);
  const dailyCap = controlPlane?.aiDailyCostCap ?? effectiveHealth?.aiCost?.cap ?? 2;
  const todaySpend = parseFloat(effectiveHealth?.aiCost?.today || '0');
  const costPct = dailyCap > 0 ? Math.min(100, (todaySpend / dailyCap) * 100) : 0;
  const remaining = Math.max(0, dailyCap - todaySpend);
  const errorMsg = updateMutation.error?.message ?? null;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>

      {errorMsg && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Database', status: dbStatus },
              { label: 'Redis', status: redisStatus },
              { label: 'Overall', status: effectiveHealth?.status },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <Badge variant={item.status === 'ok' ? 'success' : 'destructive'}>
                  {item.status || 'unknown'}
                </Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>AI Cost Tracking</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Today</span>
              <span className="font-semibold text-foreground">${todaySpend.toFixed(4)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Daily Cap</span>
              <span className="font-semibold text-foreground">${dailyCap.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Remaining</span>
              <span className={cn('font-semibold', remaining > 0 ? 'text-primary' : 'text-destructive')}>
                ${remaining.toFixed(4)}
              </span>
            </div>
            <div className="w-full bg-secondary rounded-full h-2 mt-2">
              <div
                className={cn('h-2 rounded-full transition-all', costPct > 80 ? 'bg-destructive' : 'bg-primary')}
                style={{ width: `${costPct}%` }}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>AI Spend Controls</CardTitle>
              <Badge variant={controlPlane?.aiEnabled ? 'success' : 'destructive'}>
                {controlPlane?.aiEnabled ? 'AI Active' : 'AI Disabled'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <Toggle
                label="AI Enabled"
                enabled={!!controlPlane?.aiEnabled}
                onToggle={() => update({ aiEnabled: !controlPlane?.aiEnabled })}
                disabled={updateMutation.isPending}
              />

              <div className="space-y-1.5">
                <label htmlFor="cost-cap" className="text-sm font-medium text-muted-foreground">
                  Daily Cost Cap (USD)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                    <input
                      id="cost-cap"
                      type="number"
                      min="0"
                      step="0.50"
                      value={costCapInput}
                      onChange={(e) => setCostCapInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCostCap(); }}
                      className={cn(
                        'w-full h-9 rounded-md border border-input bg-background pl-7 pr-3 text-sm',
                        'text-foreground placeholder:text-muted-foreground',
                        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      )}
                    />
                  </div>
                  <Button size="sm" onClick={handleSaveCostCap} disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? 'Saving...' : 'Save'}
                  </Button>
                </div>
              </div>

              <div className="p-3 rounded-md bg-secondary space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Spend today</span>
                  <span>${todaySpend.toFixed(4)} / ${dailyCap.toFixed(2)}</span>
                </div>
                <div className="w-full bg-muted rounded-full h-1.5">
                  <div
                    className={cn(
                      'h-1.5 rounded-full transition-all',
                      costPct > 90 ? 'bg-destructive' : costPct > 60 ? 'bg-amber-500' : 'bg-primary',
                    )}
                    style={{ width: `${costPct}%` }}
                  />
                </div>
                {costPct >= 100 && (
                  <p className="text-xs text-destructive font-medium mt-1">
                    Daily cap reached — AI requests will be blocked
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {controlPlane && !controlPlane.enabled && (
          <div className="lg:col-span-2 rounded-lg border-2 border-destructive bg-destructive/10 px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-lg font-bold text-destructive">KILL SWITCH ACTIVE</p>
              <p className="text-sm text-destructive/80">All outbound operations (SMS, email, external API calls, automation) are disabled.</p>
            </div>
            <Button
              variant="outline"
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => {
                if (window.confirm('Re-enable all outbound operations?')) update({ enabled: true });
              }}
            >
              Re-enable System
            </Button>
          </div>
        )}

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Control Plane</CardTitle>
              {controlPlane?.enabled ? (
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm('This will immediately stop ALL outbound operations (SMS, email, external API calls, automation runs). Continue?')) {
                      update({ enabled: false });
                    }
                  }}
                >
                  Activate Kill Switch
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="default"
                  onClick={() => {
                    if (window.confirm('Re-enable all outbound operations?')) update({ enabled: true });
                  }}
                >
                  Re-enable
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Toggle label="SMS" enabled={!!controlPlane?.smsEnabled} onToggle={() => update({ smsEnabled: !controlPlane?.smsEnabled })} disabled={updateMutation.isPending} />
              <Toggle label="Email" enabled={!!controlPlane?.emailEnabled} onToggle={() => update({ emailEnabled: !controlPlane?.emailEnabled })} disabled={updateMutation.isPending} />
              <Toggle label="DocuSign" enabled={!!controlPlane?.docusignEnabled} onToggle={() => update({ docusignEnabled: !controlPlane?.docusignEnabled })} disabled={updateMutation.isPending} />
              <Toggle label="External Data" enabled={!!controlPlane?.externalDataEnabled} onToggle={() => update({ externalDataEnabled: !controlPlane?.externalDataEnabled })} disabled={updateMutation.isPending} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

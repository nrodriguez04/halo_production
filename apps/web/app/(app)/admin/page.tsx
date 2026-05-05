'use client';

import { useEffect, useState } from 'react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';
import { LoadingState } from '@/components/states';
import { cn } from '@/lib/utils';
import { ShieldAlert } from 'lucide-react';

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

function ToggleRow({
  label,
  enabled,
  onToggle,
  disabled,
}: {
  label: string;
  enabled: boolean;
  onToggle: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-secondary/40 p-3">
      <span className="text-body font-medium text-foreground">{label}</span>
      <Switch checked={enabled} onCheckedChange={onToggle} disabled={disabled} aria-label={label} />
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

  const { data: health } = useApiQuery<HealthData>('/health/ready', { retry: 0 });
  const { data: healthFallback } = useApiQuery<HealthData>('/health', {
    enabled: !health,
    retry: 0,
  });
  const effectiveHealth = health ?? healthFallback ?? null;

  const { data: controlPlane, isPending: cpPending } = useApiQuery<ControlPlane>('/control-plane');

  const [costCapInput, setCostCapInput] = useState('');
  const [killDialog, setKillDialog] = useState<'enable' | 'disable' | null>(null);

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
        toast.success('Control plane updated');
        queryClient.invalidateQueries({ queryKey: ['/control-plane'] });
        queryClient.invalidateQueries({ queryKey: ['/health/ready'] });
        queryClient.invalidateQueries({ queryKey: ['/health'] });
      },
      onError: (err: any) =>
        toast.error('Update failed', { description: err?.message ?? 'Unknown error' }),
    },
  );

  const update = (updates: Partial<ControlPlane>) => updateMutation.mutate(updates);

  const handleSaveCostCap = () => {
    const val = parseFloat(costCapInput);
    if (isNaN(val) || val < 0) {
      toast.error('Enter a valid non-negative number');
      return;
    }
    update({ aiDailyCostCap: val });
  };

  if (cpPending && !effectiveHealth) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Admin" />
        <LoadingState />
      </div>
    );
  }

  const dbStatus = resolveStatus(effectiveHealth?.database);
  const redisStatus = resolveStatus(effectiveHealth?.redis);
  const dailyCap = controlPlane?.aiDailyCostCap ?? effectiveHealth?.aiCost?.cap ?? 2;
  const todaySpend = parseFloat(effectiveHealth?.aiCost?.today || '0');
  const costPct = dailyCap > 0 ? Math.min(100, (todaySpend / dailyCap) * 100) : 0;
  const remaining = Math.max(0, dailyCap - todaySpend);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Control Plane"
        description="Master switches, AI spend cap, and overall service health."
        actions={
          <Badge variant={controlPlane?.enabled ? 'success' : 'destructive'}>
            {controlPlane?.enabled ? 'Live' : 'Paused'}
          </Badge>
        }
      />

      {controlPlane && !controlPlane.enabled && (
        <Alert variant="destructive">
          <AlertTitle className="flex items-center gap-2 font-bold">
            <ShieldAlert className="h-4 w-4" />
            KILL SWITCH ACTIVE
          </AlertTitle>
          <AlertDescription className="flex items-center justify-between gap-4">
            <span>
              All outbound operations (SMS, email, external APIs, automation) are disabled.
            </span>
            <Button
              variant="outline"
              size="sm"
              className="border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={() => setKillDialog('enable')}
            >
              Re-enable System
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Database', status: dbStatus },
              { label: 'Redis', status: redisStatus },
              { label: 'Overall', status: effectiveHealth?.status ?? 'unknown' },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-between">
                <span className="text-body text-muted-foreground">{item.label}</span>
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
            <div className="flex items-baseline justify-between text-body">
              <span className="text-muted-foreground">Today</span>
              <span className="font-mono font-semibold text-foreground">
                ${todaySpend.toFixed(4)}
              </span>
            </div>
            <div className="flex items-baseline justify-between text-body">
              <span className="text-muted-foreground">Daily Cap</span>
              <span className="font-mono font-semibold text-foreground">${dailyCap.toFixed(2)}</span>
            </div>
            <div className="flex items-baseline justify-between text-body">
              <span className="text-muted-foreground">Remaining</span>
              <span
                className={cn(
                  'font-mono font-semibold',
                  remaining > 0 ? 'text-primary' : 'text-destructive',
                )}
              >
                ${remaining.toFixed(4)}
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className={cn(
                  'h-full rounded-full transition-[width] duration-slow ease-out-expo',
                  costPct > 90 ? 'bg-destructive' : costPct > 60 ? 'bg-amber-500' : 'bg-primary',
                )}
                style={{ width: `${costPct}%` }}
              />
            </div>
            {costPct >= 100 && (
              <p className="text-caption font-medium text-destructive">
                Daily cap reached — AI requests will be blocked.
              </p>
            )}
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
            <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3">
              <ToggleRow
                label="AI Enabled"
                enabled={!!controlPlane?.aiEnabled}
                onToggle={(next) => update({ aiEnabled: next })}
                disabled={updateMutation.isPending}
              />

              <div className="space-y-1.5">
                <label htmlFor="cost-cap" className="text-caption font-medium text-muted-foreground">
                  Daily Cost Cap (USD)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-body text-muted-foreground">
                      $
                    </span>
                    <Input
                      id="cost-cap"
                      type="number"
                      min="0"
                      step="0.50"
                      value={costCapInput}
                      onChange={(e) => setCostCapInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveCostCap();
                      }}
                      className="pl-7 font-mono"
                    />
                  </div>
                  <Button size="sm" loading={updateMutation.isPending} onClick={handleSaveCostCap}>
                    Save
                  </Button>
                </div>
              </div>

              <div className="space-y-1 rounded-md border border-border bg-secondary/40 p-3">
                <div className="flex justify-between text-caption text-muted-foreground">
                  <span>Spend today</span>
                  <span className="font-mono">
                    ${todaySpend.toFixed(4)} / ${dailyCap.toFixed(2)}
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn(
                      'h-1.5 rounded-full transition-[width] duration-slow ease-out-expo',
                      costPct > 90 ? 'bg-destructive' : costPct > 60 ? 'bg-amber-500' : 'bg-primary',
                    )}
                    style={{ width: `${costPct}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Outbound channels</CardTitle>
              {controlPlane?.enabled ? (
                <Button size="sm" variant="destructive" onClick={() => setKillDialog('disable')}>
                  Activate Kill Switch
                </Button>
              ) : (
                <Button size="sm" onClick={() => setKillDialog('enable')}>
                  Re-enable
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <ToggleRow
                label="SMS"
                enabled={!!controlPlane?.smsEnabled}
                onToggle={(next) => update({ smsEnabled: next })}
                disabled={updateMutation.isPending}
              />
              <ToggleRow
                label="Email"
                enabled={!!controlPlane?.emailEnabled}
                onToggle={(next) => update({ emailEnabled: next })}
                disabled={updateMutation.isPending}
              />
              <ToggleRow
                label="DocuSign"
                enabled={!!controlPlane?.docusignEnabled}
                onToggle={(next) => update({ docusignEnabled: next })}
                disabled={updateMutation.isPending}
              />
              <ToggleRow
                label="External Data"
                enabled={!!controlPlane?.externalDataEnabled}
                onToggle={(next) => update({ externalDataEnabled: next })}
                disabled={updateMutation.isPending}
              />
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={killDialog !== null} onOpenChange={(open) => !open && setKillDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {killDialog === 'disable' ? 'Activate kill switch?' : 'Re-enable system?'}
            </DialogTitle>
            <DialogDescription>
              {killDialog === 'disable'
                ? 'This immediately stops ALL outbound operations (SMS, email, external API calls, automation runs).'
                : 'All outbound operations will resume.'}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setKillDialog(null)}>
              Cancel
            </Button>
            <Button
              variant={killDialog === 'disable' ? 'destructive' : 'default'}
              loading={updateMutation.isPending}
              onClick={() => {
                update({ enabled: killDialog === 'enable' });
                setKillDialog(null);
              }}
            >
              {killDialog === 'disable' ? 'Activate Kill Switch' : 'Re-enable'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

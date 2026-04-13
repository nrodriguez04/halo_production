'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
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
}

interface HealthData {
  status: string;
  database: { status: string };
  redis: { status: string };
  controlPlane: ControlPlane;
  aiCost: {
    today: string;
    cap: number;
    remaining: string;
    status: string;
  };
}

function Toggle({ enabled, onToggle, label }: { enabled: boolean; onToggle: () => void; label: string }) {
  return (
    <div className="flex items-center justify-between p-3 rounded-md bg-secondary">
      <span className="text-sm font-medium text-foreground">{label}</span>
      <button
        onClick={onToggle}
        className={cn(
          'relative w-11 h-6 rounded-full transition-colors',
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

export default function AdminPage() {
  const [health, setHealth] = useState<HealthData | null>(null);
  const [controlPlane, setControlPlane] = useState<ControlPlane | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchHealth();
    fetchControlPlane();
  }, []);

  const fetchHealth = async () => {
    try {
      const res = await apiFetch('/health');
      setHealth(await res.json());
    } catch (error) {
      console.error('Failed to fetch health:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchControlPlane = async () => {
    try {
      const res = await apiFetch('/control-plane');
      setControlPlane(await res.json());
    } catch (error) {
      console.error('Failed to fetch control plane:', error);
    }
  };

  const update = async (updates: Partial<ControlPlane>) => {
    await apiFetch('/control-plane', { method: 'PUT', body: JSON.stringify(updates) });
    fetchControlPlane();
    fetchHealth();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading admin dashboard...</div>;
  }

  const costPct = health?.aiCost.cap
    ? Math.min(100, (parseFloat(health?.aiCost.today || '0') / health.aiCost.cap) * 100)
    : 0;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Admin Dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>System Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              { label: 'Database', status: health?.database.status },
              { label: 'Redis', status: health?.redis.status },
              { label: 'Overall', status: health?.status },
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
              <span className="font-semibold text-foreground">${health?.aiCost.today || '0.00'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Daily Cap</span>
              <span className="font-semibold text-foreground">${health?.aiCost.cap || '2.00'}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Remaining</span>
              <span className={cn('font-semibold', parseFloat(health?.aiCost.remaining || '0') > 0 ? 'text-primary' : 'text-destructive')}>
                ${health?.aiCost.remaining || '0.00'}
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
              <CardTitle>Control Plane</CardTitle>
              <Button
                size="sm"
                variant={controlPlane?.enabled ? 'default' : 'secondary'}
                onClick={() => update({ enabled: !controlPlane?.enabled })}
              >
                {controlPlane?.enabled ? 'Active' : 'Disabled'}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Toggle label="SMS" enabled={!!controlPlane?.smsEnabled} onToggle={() => update({ smsEnabled: !controlPlane?.smsEnabled })} />
              <Toggle label="Email" enabled={!!controlPlane?.emailEnabled} onToggle={() => update({ emailEnabled: !controlPlane?.emailEnabled })} />
              <Toggle label="DocuSign" enabled={!!controlPlane?.docusignEnabled} onToggle={() => update({ docusignEnabled: !controlPlane?.docusignEnabled })} />
              <Toggle label="External Data" enabled={!!controlPlane?.externalDataEnabled} onToggle={() => update({ externalDataEnabled: !controlPlane?.externalDataEnabled })} />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/toast';
import { Sparkles } from 'lucide-react';

interface AutoEnrichStatus {
  enabled: boolean;
  dailyCap: number;
  usedToday: number;
  remainingToday: number;
  waiting: number;
  blockedBy?: 'control_plane' | 'external_data' | 'disabled' | null;
}

const BLOCKED_TEXT: Record<string, string> = {
  control_plane: 'Automation is switched off on the Control Plane.',
  external_data: 'Paid data calls are switched off on the Control Plane.',
  disabled: 'Auto-enrichment is off.',
};

/**
 * New leads from markets and imports are enriched automatically, best
 * signals first, up to a daily cap. Enrichment is paid, so the cap is the
 * spending control; the budgets on Cost Governance apply on top.
 */
export function AutoEnrichCard() {
  const queryClient = useQueryClient();
  const status = useApiQuery<AutoEnrichStatus>('/sourcing/auto-enrich', {
    refetchInterval: 60_000,
  });
  const [cap, setCap] = useState('');

  useEffect(() => {
    if (status.data) setCap(String(status.data.dailyCap));
  }, [status.data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/sourcing/auto-enrich'] });
    queryClient.invalidateQueries({ queryKey: ['/control-plane'] });
  };

  const save = useApiMutation<{ autoEnrichEnabled?: boolean; autoEnrichDailyCap?: number }, unknown>(
    (updates) => apiJson('/control-plane', { method: 'PUT', body: JSON.stringify(updates) }),
    {
      onSuccess: () => {
        toast.success('Auto-enrichment updated');
        refresh();
      },
      onError: (err) => toast.error('Could not update', { description: err?.message }),
    },
  );

  const runNow = useApiMutation<void, { queued: number; status: AutoEnrichStatus }>(
    () => apiJson('/sourcing/auto-enrich/run', { method: 'POST' }),
    {
      onSuccess: (res) => {
        toast.success(
          res.queued > 0 ? `${res.queued} lead(s) sent to enrichment` : 'Nothing to enrich right now',
          {
            description: res.status.blockedBy
              ? BLOCKED_TEXT[res.status.blockedBy]
              : `${res.status.remainingToday} left today`,
          },
        );
        refresh();
        queryClient.invalidateQueries({ queryKey: ['/leads'] });
      },
      onError: (err) => toast.error('Could not run', { description: err?.message }),
    },
  );

  const s = status.data;
  const saveCap = () => {
    const n = Number(cap);
    if (!Number.isInteger(n) || n < 0 || n > 1000) {
      toast.error('Enter a whole number from 0 to 1000');
      return;
    }
    save.mutate({ autoEnrichDailyCap: n });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Sparkles size={16} aria-hidden /> Auto-enrichment
          </CardTitle>
          {s && (
            <Badge variant={s.blockedBy ? 'secondary' : 'success'}>
              {s.blockedBy ? 'Off' : `${s.usedToday} of ${s.dailyCap} used today`}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-caption text-muted-foreground">
          New leads from your markets and imports are enriched automatically, best signals first:
          property lookup and geocoding now, skip trace after the Lead Analyst scores them 60 or
          higher. Each enrichment is a paid call, so the daily cap is your spending limit; the
          budgets on Cost Governance still apply.
        </p>
        {status.isPending ? (
          <p className="text-caption text-muted-foreground">Loading…</p>
        ) : s ? (
          <div className="grid gap-4 md:grid-cols-[auto_1fr_auto] md:items-end">
            <label className="flex items-center gap-3 text-body">
              <Switch
                checked={s.enabled}
                onCheckedChange={(next: boolean) => save.mutate({ autoEnrichEnabled: next })}
                disabled={save.isPending}
                aria-label="Auto-enrichment"
              />
              {s.enabled ? 'On' : 'Off'}
            </label>
            <div className="space-y-1.5">
              <label htmlFor="auto-enrich-cap" className="text-caption font-medium text-muted-foreground">
                Leads per day
              </label>
              <div className="flex gap-2">
                <Input
                  id="auto-enrich-cap"
                  type="number"
                  min="0"
                  max="1000"
                  step="1"
                  value={cap}
                  onChange={(e) => setCap(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveCap();
                  }}
                  className="max-w-32 font-mono"
                />
                <Button size="sm" variant="outline" onClick={saveCap} disabled={save.isPending}>
                  Save
                </Button>
              </div>
            </div>
            <Button
              size="sm"
              onClick={() => runNow.mutate()}
              disabled={runNow.isPending || !!s.blockedBy || s.remainingToday === 0}
            >
              Enrich now
            </Button>
          </div>
        ) : null}
        {s && (
          <p className="text-caption text-muted-foreground">
            {s.waiting} new lead(s) waiting
            {s.blockedBy ? ` · ${BLOCKED_TEXT[s.blockedBy]}` : ` · ${s.remainingToday} left today`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

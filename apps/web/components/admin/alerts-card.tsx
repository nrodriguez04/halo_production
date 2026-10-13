'use client';

import { useApiQuery, useApiMutation, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/toast';
import { BellRing } from 'lucide-react';

interface AlertsStatus {
  configured: boolean;
  environment: string;
}

/** Whether operational alerts reach a webhook, and a button to prove it. */
export function AlertsCard() {
  const status = useApiQuery<AlertsStatus>('/admin/alerts', { retry: false });
  const test = useApiMutation<void, { configured: boolean; delivered: boolean }>(
    () => apiJson('/admin/alerts/test', { method: 'POST' }),
    {
      onSuccess: (res) =>
        res.delivered
          ? toast.success('Test alert delivered', { description: 'Check your channel.' })
          : toast.error('Test alert not delivered', {
              description: res.configured
                ? 'The webhook did not accept it; check the URL.'
                : 'Set ALERT_WEBHOOK_URL in the server environment first.',
            }),
      onError: (err) => toast.error('Could not send', { description: err?.message }),
    },
  );

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BellRing size={16} aria-hidden /> Alerts
          </CardTitle>
          {status.data && (
            <Badge variant={status.data.configured ? 'success' : 'warning'}>
              {status.data.configured ? 'Webhook set' : 'Not configured'}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-caption text-muted-foreground">
          Unexpected errors, jobs that fail after their retries, and budgets reaching 95% or 100%
          are posted to the webhook in ALERT_WEBHOOK_URL (Slack, Discord or Teams). Downtime alerts
          come from the server&apos;s health watcher; see the deployment runbook.
        </p>
        <Button size="sm" variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
          Send test alert
        </Button>
      </CardContent>
    </Card>
  );
}

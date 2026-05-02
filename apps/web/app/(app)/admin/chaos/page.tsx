'use client';

import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Zap, RotateCcw, Trash2, RefreshCw, Loader2 } from 'lucide-react';

interface ChaosStatus {
  active: boolean;
  simulations: Record<string, string>;
}

interface FailedJob {
  id: string;
  queue: string;
  name: string;
  failedReason: string;
  attemptsMade: number;
  timestamp: number;
}

const drills = [
  { name: 'Twilio 429 Rate Limit', endpoint: 'twilio-429', description: 'Simulate Twilio rate limiting on SMS send' },
  { name: 'DocuSign Outage', endpoint: 'docusign-outage', description: 'Simulate DocuSign API outage' },
  { name: 'ATTOM 5xx Error', endpoint: 'attom-5xx', description: 'Simulate ATTOM server error' },
];

export default function ChaosAdminPage() {
  const queryClient = useQueryClient();

  const { data: status, isPending: statusPending } = useApiQuery<ChaosStatus>('/admin/chaos/status');
  const { data: failedJobs = [], isPending: dlqPending } = useApiQuery<FailedJob[]>('/admin/dlq');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/admin/chaos/status'] });
    queryClient.invalidateQueries({ queryKey: ['/admin/dlq'] });
  };

  const triggerDrill = useApiMutation<string, unknown>(
    (endpoint) => apiJson(`/admin/chaos/${endpoint}`, { method: 'POST' }),
    { onSuccess: invalidate },
  );

  const clearChaos = useApiMutation<void, unknown>(
    () => apiJson('/admin/chaos/clear', { method: 'POST' }),
    { onSuccess: invalidate },
  );

  const replayJob = useApiMutation<{ queue: string; jobId: string }, unknown>(
    ({ queue, jobId }) => apiJson(`/admin/dlq/${jobId}/replay?queue=${queue}`, { method: 'POST' }),
    { onSuccess: invalidate },
  );

  const loading = statusPending || dlqPending;
  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Chaos Engineering & DLQ</h1>
          <p className="text-sm text-muted-foreground mt-1">Test resilience and manage failed jobs</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={invalidate}>
            <RefreshCw size={16} className="mr-2" /> Refresh
          </Button>
          {status?.active && (
            <Button variant="destructive" size="sm" onClick={() => clearChaos.mutate()} disabled={clearChaos.isPending}>
              {clearChaos.isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Trash2 size={16} className="mr-2" />}
              Clear All Chaos
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap size={16} className={status?.active ? 'text-amber-400' : 'text-muted-foreground'} />
            <CardTitle>Chaos Drills</CardTitle>
            <Badge variant={status?.active ? 'warning' : 'secondary'}>
              {status?.active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {status?.active && Object.keys(status.simulations).length > 0 && (
            <div className="mb-4 p-3 rounded bg-amber-500/10 border border-amber-500/20">
              <p className="text-sm font-medium text-amber-400 mb-1">Active simulations:</p>
              {Object.entries(status.simulations).map(([k, v]) => (
                <Badge key={k} variant="warning" className="mr-2">{k}: {v}</Badge>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {drills.map((drill) => {
              const isPending = triggerDrill.isPending && triggerDrill.variables === drill.endpoint;
              return (
                <div key={drill.endpoint} className="p-4 rounded bg-secondary space-y-2">
                  <p className="text-sm font-medium text-foreground">{drill.name}</p>
                  <p className="text-xs text-muted-foreground">{drill.description}</p>
                  <Button size="sm" variant="outline" onClick={() => triggerDrill.mutate(drill.endpoint)} disabled={isPending}>
                    {isPending ? <Loader2 size={14} className="mr-2 animate-spin" /> : <Zap size={14} className="mr-2" />}
                    Trigger
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <RotateCcw size={16} className="text-primary" />
            <CardTitle>Dead Letter Queue ({failedJobs.length} failed jobs)</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Queue</TableHead>
                <TableHead>Job</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {failedJobs.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No failed jobs
                  </TableCell>
                </TableRow>
              ) : (
                failedJobs.map((job) => {
                  const isReplaying =
                    replayJob.isPending &&
                    replayJob.variables?.jobId === job.id &&
                    replayJob.variables?.queue === job.queue;
                  return (
                    <TableRow key={`${job.queue}-${job.id}`}>
                      <TableCell><Badge variant="secondary">{job.queue}</Badge></TableCell>
                      <TableCell className="text-sm text-foreground">{job.name}</TableCell>
                      <TableCell className="text-sm text-destructive max-w-xs truncate">{job.failedReason}</TableCell>
                      <TableCell className="text-muted-foreground">{job.attemptsMade}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => replayJob.mutate({ queue: job.queue, jobId: job.id })}
                          disabled={isReplaying}
                        >
                          {isReplaying ? <Loader2 size={14} className="mr-1 animate-spin" /> : <RotateCcw size={14} className="mr-1" />}
                          Replay
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

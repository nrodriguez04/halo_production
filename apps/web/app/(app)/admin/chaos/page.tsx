'use client';

import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';
import { LoadingState, EmptyState } from '@/components/states';
import { useReducedMotion, staggerDelay } from '@/lib/motion';
import { Zap, RotateCcw, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';

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
  {
    name: 'Twilio 429 Rate Limit',
    endpoint: 'twilio-429',
    description: 'Simulate Twilio rate limiting on SMS send',
  },
  {
    name: 'DocuSign Outage',
    endpoint: 'docusign-outage',
    description: 'Simulate DocuSign API outage',
  },
  {
    name: 'ATTOM 5xx Error',
    endpoint: 'attom-5xx',
    description: 'Simulate ATTOM server error',
  },
];

export default function ChaosAdminPage() {
  const queryClient = useQueryClient();
  const reduced = useReducedMotion();

  const { data: status, isPending: statusPending } = useApiQuery<ChaosStatus>(
    '/admin/chaos/status',
  );
  const { data: failedJobs = [], isPending: dlqPending } = useApiQuery<FailedJob[]>('/admin/dlq');

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['/admin/chaos/status'] });
    queryClient.invalidateQueries({ queryKey: ['/admin/dlq'] });
  };

  const triggerDrill = useApiMutation<string, unknown>(
    (endpoint) => apiJson(`/admin/chaos/${endpoint}`, { method: 'POST' }),
    {
      onSuccess: (_d, endpoint) => {
        toast.success(`Triggered ${endpoint}`);
        invalidate();
      },
      onError: (err: any) => toast.error('Drill failed', { description: err?.message }),
    },
  );

  const clearChaos = useApiMutation<void, unknown>(
    () => apiJson('/admin/chaos/clear', { method: 'POST' }),
    {
      onSuccess: () => {
        toast.success('All chaos cleared');
        invalidate();
      },
      onError: (err: any) => toast.error('Clear failed', { description: err?.message }),
    },
  );

  const replayJob = useApiMutation<{ queue: string; jobId: string }, unknown>(
    ({ queue, jobId }) => apiJson(`/admin/dlq/${jobId}/replay?queue=${queue}`, { method: 'POST' }),
    {
      onSuccess: () => {
        toast.success('Job replayed');
        invalidate();
      },
      onError: (err: any) => toast.error('Replay failed', { description: err?.message }),
    },
  );

  const loading = statusPending || dlqPending;
  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Chaos & DLQ" />
        <LoadingState />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Chaos & DLQ"
        description="Test resilience with controlled failure injection and manage failed jobs."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={invalidate}>
              <RefreshCw size={16} className="mr-2" />
              Refresh
            </Button>
            {status?.active && (
              <Button
                variant="destructive"
                size="sm"
                loading={clearChaos.isPending}
                onClick={() => clearChaos.mutate()}
              >
                <Trash2 size={16} className="mr-2" />
                Clear All Chaos
              </Button>
            )}
          </>
        }
      />

      {status?.active && Object.keys(status.simulations).length > 0 && (
        <Alert variant="warning">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Active simulations</AlertTitle>
          <AlertDescription>
            <div className="mt-1 flex flex-wrap gap-2">
              {Object.entries(status.simulations).map(([k, v]) => (
                <Badge key={k} variant="warning">
                  {k}: {v}
                </Badge>
              ))}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Zap
              size={16}
              className={status?.active ? 'text-amber-400' : 'text-muted-foreground'}
              aria-hidden
            />
            <CardTitle>Chaos Drills</CardTitle>
            <Badge variant={status?.active ? 'warning' : 'secondary'}>
              {status?.active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {drills.map((drill, i) => {
              const isPending =
                triggerDrill.isPending && triggerDrill.variables === drill.endpoint;
              return (
                <Card
                  key={drill.endpoint}
                  variant="flat"
                  className="animate-fade-up"
                  style={{ animationDelay: staggerDelay(i, reduced) }}
                >
                  <CardContent className="space-y-2 bg-secondary/40 p-4">
                    <p className="text-body font-medium text-foreground">{drill.name}</p>
                    <p className="text-caption text-muted-foreground">{drill.description}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      loading={isPending}
                      onClick={() => triggerDrill.mutate(drill.endpoint)}
                    >
                      <Zap size={14} className="mr-2" />
                      Trigger
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <RotateCcw size={16} className="text-primary" aria-hidden />
            <CardTitle>Dead Letter Queue ({failedJobs.length} failed)</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {failedJobs.length === 0 ? (
            <EmptyState
              icon={RotateCcw}
              title="No failed jobs"
              description="When jobs fail, they'll appear here for manual replay."
              className="border-0"
            />
          ) : (
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
                {failedJobs.map((job) => {
                  const isReplaying =
                    replayJob.isPending &&
                    replayJob.variables?.jobId === job.id &&
                    replayJob.variables?.queue === job.queue;
                  return (
                    <TableRow key={`${job.queue}-${job.id}`}>
                      <TableCell>
                        <Badge variant="secondary">{job.queue}</Badge>
                      </TableCell>
                      <TableCell className="text-body text-foreground">{job.name}</TableCell>
                      <TableCell>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span className="block max-w-xs truncate text-body text-destructive">
                              {job.failedReason}
                            </span>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-sm">{job.failedReason}</TooltipContent>
                        </Tooltip>
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {job.attemptsMade}
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={isReplaying}
                          onClick={() => replayJob.mutate({ queue: job.queue, jobId: job.id })}
                        >
                          <RotateCcw size={14} className="mr-1" />
                          Replay
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

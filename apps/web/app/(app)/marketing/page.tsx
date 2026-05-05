'use client';

import { useState } from 'react';
import { useApiQuery, useQueryClient, apiJson, apiFetch } from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';
import { LoadingState, EmptyState, SkeletonTable } from '@/components/states';
import { useReducedMotion, staggerDelay } from '@/lib/motion';
import { FileImage, Film, Mail, RefreshCw, Megaphone } from 'lucide-react';

interface JobRun {
  id: string;
  kind: string;
  entityId: string;
  status: string;
  resultJson?: any;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

interface Deal {
  id: string;
  stage: string;
  property?: { address?: string };
}

type GeneratingKind = 'flyer' | 'video' | 'blast';

export default function MarketingPage() {
  const queryClient = useQueryClient();
  const reduced = useReducedMotion();
  const { data: deals = [], isPending, refetch } = useApiQuery<Deal[]>('/deals');
  const [generating, setGenerating] = useState<{ dealId: string; kind: GeneratingKind } | null>(
    null,
  );

  const startJob = async (path: string, dealId: string, kind: GeneratingKind, label: string) => {
    setGenerating({ dealId, kind });
    try {
      const res = await apiFetch(path, { method: 'POST' });
      if (!res.ok) {
        const txt = await res.text();
        toast.error(`Could not start ${label}`, { description: txt || res.statusText });
        return;
      }
      const { jobId } = (await res.json()) as { jobId: string };
      toast.success(`${label} queued`);
      await pollJob(jobId);
      queryClient.invalidateQueries({ queryKey: ['/deals'] });
    } catch (err: any) {
      toast.error(`Could not start ${label}`, { description: err?.message });
    } finally {
      setGenerating(null);
    }
  };

  const sendBuyerBlast = async (dealId: string) => {
    setGenerating({ dealId, kind: 'blast' });
    try {
      await apiJson(`/marketing/buyer-blast/${dealId}`, {
        method: 'POST',
        body: JSON.stringify({ buyerIds: [] }),
      });
      toast.success('Buyer blast queued');
    } catch (err: any) {
      toast.error('Buyer blast failed', { description: err?.message });
    } finally {
      setGenerating(null);
    }
  };

  const pollJob = async (jobId: string) => {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await apiFetch(`/jobs/${jobId}`);
      if (!res.ok) continue;
      const job: JobRun = await res.json();
      if (job.status === 'SUCCEEDED' || job.status === 'FAILED') return;
    }
  };

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Marketing"
        description="Generate flyers, video scripts, and blast offers to your buyer list."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw size={16} className="mr-2" />
            Refresh
          </Button>
        }
      />

      {isPending ? (
        <LoadingState skeleton>
          <SkeletonTable rows={4} cols={3} />
        </LoadingState>
      ) : deals.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No deals to market yet"
          description="Convert qualified leads into deals to generate marketing assets."
        />
      ) : (
        <div className="space-y-4">
          {deals.map((deal, i) => {
            const busy = generating?.dealId === deal.id;
            return (
              <Card
                key={deal.id}
                variant="interactive"
                className="animate-fade-up"
                style={{ animationDelay: staggerDelay(i, reduced, 30) }}
              >
                <CardHeader className="pb-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <CardTitle className="text-body font-semibold text-foreground">
                      {deal.property?.address || `Deal ${deal.id.slice(0, 8)}`}
                    </CardTitle>
                    <Badge variant="outline">{deal.stage.replace('_', ' ')}</Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={busy && generating?.kind === 'flyer'}
                          disabled={busy && generating?.kind !== 'flyer'}
                          onClick={() =>
                            startJob(`/marketing/flyer/${deal.id}`, deal.id, 'flyer', 'Flyer')
                          }
                        >
                          <FileImage size={14} className="mr-2" />
                          Generate Flyer
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Render a printable property flyer</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={busy && generating?.kind === 'video'}
                          disabled={busy && generating?.kind !== 'video'}
                          onClick={() =>
                            startJob(
                              `/marketing/video-script/${deal.id}`,
                              deal.id,
                              'video',
                              'Video script',
                            )
                          }
                        >
                          <Film size={14} className="mr-2" />
                          Video Script
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Generate a 30s walk-through script</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          loading={busy && generating?.kind === 'blast'}
                          disabled={busy && generating?.kind !== 'blast'}
                          onClick={() => sendBuyerBlast(deal.id)}
                        >
                          <Mail size={14} className="mr-2" />
                          Buyer Blast
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Email all matching buyers</TooltipContent>
                    </Tooltip>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

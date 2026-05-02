'use client';

import { useState } from 'react';
import { useApiQuery, useQueryClient, apiJson, apiFetch } from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FileImage, Film, Mail, RefreshCw, Loader2 } from 'lucide-react';

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

export default function MarketingPage() {
  const queryClient = useQueryClient();
  const { data: deals = [], isPending, refetch } = useApiQuery<Deal[]>('/deals');
  const [generating, setGenerating] = useState<string | null>(null);

  const startJob = async (path: string, dealId: string) => {
    setGenerating(dealId);
    try {
      const res = await apiFetch(path, { method: 'POST' });
      if (!res.ok) return;
      const { jobId } = (await res.json()) as { jobId: string };
      await pollJob(jobId);
      queryClient.invalidateQueries({ queryKey: ['/deals'] });
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

  if (isPending) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading marketing...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Marketing</h1>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw size={16} className="mr-2" /> Refresh
        </Button>
      </div>

      {deals.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No deals to generate marketing for. Create deals first.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {deals.map((deal) => (
            <Card key={deal.id}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base text-foreground">
                    {deal.property?.address || `Deal ${deal.id.slice(0, 8)}`}
                  </CardTitle>
                  <Badge variant="secondary">{deal.stage}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => startJob(`/marketing/flyer/${deal.id}`, deal.id)}
                    disabled={generating === deal.id}
                  >
                    {generating === deal.id ? <Loader2 size={14} className="mr-2 animate-spin" /> : <FileImage size={14} className="mr-2" />}
                    Generate Flyer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => startJob(`/marketing/video-script/${deal.id}`, deal.id)}
                    disabled={generating === deal.id}
                  >
                    <Film size={14} className="mr-2" /> Video Script
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await apiJson(`/marketing/buyer-blast/${deal.id}`, {
                        method: 'POST',
                        body: JSON.stringify({ buyerIds: [] }),
                      }).catch(() => undefined);
                    }}
                  >
                    <Mail size={14} className="mr-2" /> Buyer Blast
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-fetch';
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

export default function MarketingPage() {
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<string | null>(null);

  useEffect(() => {
    fetchDeals();
  }, []);

  const fetchDeals = async () => {
    try {
      const res = await apiFetch('/deals');
      const data = await res.json();
      setDeals(Array.isArray(data) ? data : []);
    } catch {
    } finally {
      setLoading(false);
    }
  };

  const generateFlyer = async (dealId: string) => {
    setGenerating(dealId);
    try {
      const res = await apiFetch(`/marketing/flyer/${dealId}`, { method: 'POST' });
      if (res.ok) {
        const { jobId } = await res.json();
        pollJob(jobId);
      }
    } finally {
      setGenerating(null);
    }
  };

  const generateVideoScript = async (dealId: string) => {
    setGenerating(dealId);
    try {
      const res = await apiFetch(`/marketing/video-script/${dealId}`, { method: 'POST' });
      if (res.ok) {
        const { jobId } = await res.json();
        pollJob(jobId);
      }
    } finally {
      setGenerating(null);
    }
  };

  const pollJob = async (jobId: string) => {
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 2000));
      const res = await apiFetch(`/jobs/${jobId}`);
      if (res.ok) {
        const job: JobRun = await res.json();
        if (job.status === 'SUCCEEDED' || job.status === 'FAILED') {
          fetchDeals();
          return;
        }
      }
    }
  };

  const statusVariant = (s: string) => {
    if (s === 'SUCCEEDED') return 'success' as const;
    if (s === 'FAILED') return 'destructive' as const;
    if (s === 'RUNNING') return 'warning' as const;
    return 'secondary' as const;
  };

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading marketing...</div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Marketing</h1>
        <Button variant="outline" size="sm" onClick={fetchDeals}>
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
                    onClick={() => generateFlyer(deal.id)}
                    disabled={generating === deal.id}
                  >
                    {generating === deal.id ? <Loader2 size={14} className="mr-2 animate-spin" /> : <FileImage size={14} className="mr-2" />}
                    Generate Flyer
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => generateVideoScript(deal.id)}
                    disabled={generating === deal.id}
                  >
                    <Film size={14} className="mr-2" /> Video Script
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      await apiFetch(`/marketing/buyer-blast/${deal.id}`, {
                        method: 'POST',
                        body: JSON.stringify({ buyerIds: [] }),
                      });
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

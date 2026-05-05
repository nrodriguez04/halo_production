'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/api-fetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';
import { LoadingState, EmptyState, ErrorState } from '@/components/states';
import { cn } from '@/lib/utils';
import { FileText, Brain, Clock, MapPin, Calculator } from 'lucide-react';

const MapGL = dynamic(() => import('react-map-gl/maplibre').then((m) => m.default), { ssr: false });
const Marker = dynamic(() => import('react-map-gl/maplibre').then((m) => m.Marker), { ssr: false });

interface Deal {
  id: string;
  stage: string;
  arv?: number;
  repairEstimate?: number;
  mao?: number;
  offerAmount?: number;
  createdAt: string;
  property?: {
    id: string;
    address: string;
    city: string;
    state: string;
    latitude?: number;
    longitude?: number;
    estimatedValue?: number;
  };
  lead?: { id: string; canonicalOwner?: string; canonicalPhone?: string };
  contracts?: Array<{ id: string; status: string; createdAt: string }>;
  marketingMaterials?: Array<{ id: string; type: string; createdAt: string }>;
}

interface TimelineEvent {
  id: string;
  eventType: string;
  payloadJson: any;
  actorType: string;
  actorId?: string;
  createdAt: string;
}

interface UnderwritingResult {
  arv?: number;
  mao?: number;
  repairEstimate?: number;
  confidence?: number;
  summary?: string;
}

const stageVariant = (stage: string) => {
  switch (stage) {
    case 'new':
      return 'secondary' as const;
    case 'contacted':
      return 'info' as const;
    case 'negotiating':
      return 'warning' as const;
    case 'under_contract':
      return 'default' as const;
    case 'marketing':
      return 'info' as const;
    case 'assigned':
      return 'success' as const;
    case 'closed':
      return 'success' as const;
    case 'lost':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
};

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [uwResult, setUwResult] = useState<UnderwritingResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setLoading(true);
    setErrored(false);
    Promise.all([
      apiFetch(`/deals/${id}`).then(async (r) => (r.ok ? r.json() : null)),
      apiFetch(`/timeline/DEAL/${id}`).then(async (r) => (r.ok ? r.json() : [])),
      apiFetch(`/underwriting/result/${id}`).then(async (r) => (r.ok ? r.json() : null)),
    ])
      .then(([d, t, u]) => {
        if (cancelled) return;
        setDeal(d);
        setTimeline(t ?? []);
        setUwResult(u);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  async function runUnderwriting() {
    if (analyzing) return;
    setAnalyzing(true);
    try {
      const res = await apiFetch(`/underwriting/analyze/${id}`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      toast.success('Underwriting analysis queued');
      // Re-fetch results -- the worker may take a moment.
      const next = await apiFetch(`/underwriting/result/${id}`).then((r) => (r.ok ? r.json() : null));
      setUwResult(next);
    } catch (err: any) {
      toast.error('Failed to run underwriting', { description: err?.message });
    } finally {
      setAnalyzing(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Loading…" />
        <LoadingState />
      </div>
    );
  }
  if (errored || !deal) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Deal not found" />
        <ErrorState
          title="Deal not found"
          description="It may have been deleted or you don't have access."
        />
      </div>
    );
  }

  const hasCoords = deal.property?.latitude && deal.property?.longitude;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={deal.property?.address || `Deal ${deal.id.slice(0, 8)}`}
        description={
          deal.property ? `${deal.property.city}, ${deal.property.state}` : undefined
        }
        actions={
          <Badge variant={stageVariant(deal.stage)} className="px-3 py-1 text-sm">
            {deal.stage.replace('_', ' ')}
          </Badge>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="animate-fade-up lg:col-span-2">
          <CardHeader>
            <CardTitle>Deal Financials</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              {[
                { label: 'ARV', value: deal.arv },
                { label: 'Repairs', value: deal.repairEstimate },
                { label: 'MAO', value: deal.mao },
                { label: 'Offer', value: deal.offerAmount, highlight: true },
              ].map((f) => (
                <div key={f.label} className="space-y-1">
                  <p className="text-caption uppercase tracking-wider text-muted-foreground">{f.label}</p>
                  <p
                    className={cn(
                      'font-mono text-h3 font-bold',
                      f.highlight ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {f.value != null ? `$${f.value.toLocaleString()}` : '—'}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="animate-fade-up overflow-hidden" style={{ animationDelay: '60ms' }}>
          <CardContent className="p-0">
            {hasCoords ? (
              <div className="h-48 w-full">
                <MapGL
                  initialViewState={{
                    latitude: deal.property!.latitude!,
                    longitude: deal.property!.longitude!,
                    zoom: 14,
                  }}
                  mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
                  style={{ width: '100%', height: '100%' }}
                  interactive={false}
                >
                  <Marker latitude={deal.property!.latitude!} longitude={deal.property!.longitude!}>
                    <MapPin size={28} className="fill-primary/30 text-primary" />
                  </Marker>
                </MapGL>
              </div>
            ) : (
              <div className="flex h-48 items-center justify-center text-body text-muted-foreground">
                No coordinates available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contracts">
            Contracts {deal.contracts?.length ? `(${deal.contracts.length})` : ''}
          </TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Brain size={16} className="text-primary" aria-hidden />
                  <CardTitle>Underwriting Results</CardTitle>
                </div>
                {!uwResult && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={runUnderwriting}
                        loading={analyzing}
                      >
                        <Calculator size={14} className="mr-2" />
                        Run Underwriting
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Queue an AI underwriting pass for this deal</TooltipContent>
                  </Tooltip>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {uwResult ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <p className="text-caption uppercase tracking-wider text-muted-foreground">AI ARV</p>
                      <p className="font-mono text-body font-semibold text-foreground">
                        {uwResult.arv ? `$${uwResult.arv.toLocaleString()}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-caption uppercase tracking-wider text-muted-foreground">AI MAO</p>
                      <p className="font-mono text-body font-semibold text-foreground">
                        {uwResult.mao ? `$${uwResult.mao.toLocaleString()}` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-caption uppercase tracking-wider text-muted-foreground">Confidence</p>
                      <p className="font-mono text-body font-semibold text-foreground">
                        {uwResult.confidence ? `${(uwResult.confidence * 100).toFixed(0)}%` : '—'}
                      </p>
                    </div>
                  </div>
                  {uwResult.summary && (
                    <p className="border-t border-border pt-3 text-body text-muted-foreground">
                      {uwResult.summary}
                    </p>
                  )}
                </div>
              ) : (
                <div className="py-3 text-body text-muted-foreground">
                  No underwriting run yet. Click <span className="font-medium text-foreground">Run Underwriting</span> above to queue an AI pass.
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="contracts">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <FileText size={16} className="text-primary" aria-hidden />
                <CardTitle>Contracts</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {(deal.contracts?.length || 0) > 0 ? (
                <div className="space-y-2">
                  {deal.contracts!.map((c) => (
                    <div
                      key={c.id}
                      className="flex items-center justify-between rounded-md border border-border bg-secondary/40 px-3 py-2"
                    >
                      <Badge variant="info">{c.status}</Badge>
                      <span className="text-caption text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={FileText}
                  title="No contracts yet"
                  description="Generated contracts and DocuSign envelopes will appear here."
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Clock size={16} className="text-primary" aria-hidden />
                <CardTitle>Timeline</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {timeline.length === 0 ? (
                <EmptyState
                  icon={Clock}
                  title="No events"
                  description="Activity will populate here as the deal progresses."
                />
              ) : (
                <ol className="relative space-y-4 border-l border-border pl-5">
                  {timeline.map((ev) => (
                    <li key={ev.id} className="relative">
                      <span
                        aria-hidden
                        className="absolute -left-[11px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary shadow-glow"
                      />
                      <div className="rounded-md border border-border bg-card/60 px-3 py-2.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-body font-medium text-foreground">{ev.eventType}</span>
                          <span className="text-caption text-muted-foreground">
                            {new Date(ev.createdAt).toLocaleString()}
                          </span>
                        </div>
                        <p className="mt-0.5 text-caption text-muted-foreground">
                          {ev.actorType}: {ev.actorId || 'system'}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

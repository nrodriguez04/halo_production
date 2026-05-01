'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { apiFetch } from '@/lib/api-fetch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { FileText, Brain, Clock, MapPin } from 'lucide-react';

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
    case 'new': return 'secondary' as const;
    case 'contacted': return 'info' as const;
    case 'negotiating': return 'warning' as const;
    case 'under_contract': return 'default' as const;
    case 'marketing': return 'info' as const;
    case 'assigned': return 'success' as const;
    case 'closed': return 'success' as const;
    case 'lost': return 'destructive' as const;
    default: return 'secondary' as const;
  }
};

export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [deal, setDeal] = useState<Deal | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [uwResult, setUwResult] = useState<UnderwritingResult | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      apiFetch(`/deals/${id}`)
        .then(async (r) => {
          if (!r.ok) {
            console.error('Failed to fetch deal:', r.status, r.statusText);
            return null;
          }
          return r.json();
        })
        .then(setDeal)
        .catch(() => setDeal(null)),
      apiFetch(`/timeline/DEAL/${id}`)
        .then(async (r) => {
          if (!r.ok) {
            console.error('Failed to fetch timeline:', r.status, r.statusText);
            return [];
          }
          return r.json();
        })
        .then(setTimeline)
        .catch(() => setTimeline([])),
      apiFetch(`/underwriting/result/${id}`)
        .then(async (r) => {
          if (!r.ok) {
            console.error('Failed to fetch underwriting result:', r.status, r.statusText);
            return null;
          }
          return r.json();
        })
        .then(setUwResult)
        .catch(() => setUwResult(null)),
    ]).finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="flex items-center justify-center h-64 text-muted-foreground">Loading deal...</div>;
  if (!deal) return <div className="p-6 text-destructive">Deal not found</div>;

  const hasCoords = deal.property?.latitude && deal.property?.longitude;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">
            {deal.property?.address || `Deal ${deal.id.slice(0, 8)}`}
          </h1>
          {deal.property && (
            <p className="text-sm text-muted-foreground">{deal.property.city}, {deal.property.state}</p>
          )}
        </div>
        <Badge variant={stageVariant(deal.stage)} className="text-base px-4 py-1">
          {deal.stage.replace('_', ' ')}
        </Badge>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Financials */}
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Deal Financials</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'ARV', value: deal.arv },
                { label: 'Repairs', value: deal.repairEstimate },
                { label: 'MAO', value: deal.mao },
                { label: 'Offer', value: deal.offerAmount, highlight: true },
              ].map((f) => (
                <div key={f.label} className="space-y-1">
                  <p className="text-xs text-muted-foreground">{f.label}</p>
                  <p className={cn('text-lg font-bold', f.highlight ? 'text-primary' : 'text-foreground')}>
                    {f.value != null ? `$${f.value.toLocaleString()}` : '--'}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Map pin */}
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            {hasCoords ? (
              <div className="h-48 w-full">
                <MapGL
                  initialViewState={{ latitude: deal.property!.latitude!, longitude: deal.property!.longitude!, zoom: 14 }}
                  mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
                  style={{ width: '100%', height: '100%' }}
                  interactive={false}
                >
                  <Marker latitude={deal.property!.latitude!} longitude={deal.property!.longitude!}>
                    <MapPin size={28} className="text-primary fill-primary/30" />
                  </Marker>
                </MapGL>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                No coordinates available
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Underwriting results */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Brain size={16} className="text-primary" />
              <CardTitle>Underwriting Results</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {uwResult ? (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">AI ARV</p>
                    <p className="font-semibold text-foreground">{uwResult.arv ? `$${uwResult.arv.toLocaleString()}` : '--'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">AI MAO</p>
                    <p className="font-semibold text-foreground">{uwResult.mao ? `$${uwResult.mao.toLocaleString()}` : '--'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Confidence</p>
                    <p className="font-semibold text-foreground">{uwResult.confidence ? `${(uwResult.confidence * 100).toFixed(0)}%` : '--'}</p>
                  </div>
                </div>
                {uwResult.summary && <p className="text-sm text-muted-foreground">{uwResult.summary}</p>}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">
                No underwriting run yet.
                <Button variant="outline" size="sm" className="ml-3" onClick={async () => {
                  const res = await apiFetch(`/underwriting/analyze/${id}`, { method: 'POST' });
                  if (!res.ok) {
                    console.error('Underwriting analyze failed:', res.status, res.statusText);
                    return;
                  }
                }}>
                  Run Underwriting
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Contracts */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileText size={16} className="text-primary" />
              <CardTitle>Contracts</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {(deal.contracts?.length || 0) > 0 ? (
              <div className="space-y-2">
                {deal.contracts!.map((c) => (
                  <div key={c.id} className="flex items-center justify-between p-2 rounded bg-secondary">
                    <Badge variant="info">{c.status}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(c.createdAt).toLocaleDateString()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No contracts yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Clock size={16} className="text-primary" />
            <CardTitle>Timeline</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events yet</p>
          ) : (
            <div className="space-y-3">
              {timeline.map((ev) => (
                <div key={ev.id} className="flex items-start gap-3 p-3 rounded bg-secondary">
                  <div className="w-2 h-2 rounded-full bg-primary mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-foreground">{ev.eventType}</span>
                      <span className="text-xs text-muted-foreground">{new Date(ev.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {ev.actorType}: {ev.actorId || 'system'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

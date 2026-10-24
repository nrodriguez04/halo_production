'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';
import { LoadingState, EmptyState, ErrorState } from '@/components/states';
import { cn } from '@/lib/utils';
import { FileText, Clock, MapPin, Inbox } from 'lucide-react';
import { ContractsPanel, type ContractRow } from '@/components/deals/contracts-panel';
import { BuyerPricePanel, type DealPricing } from '@/components/deals/buyer-price-panel';
import { EconomicsCard, EligibilityCard, NextActionsCard } from '@/components/disposition/overview-cards';
import { AgreementPanel } from '@/components/disposition/agreement-panel';
import { BuyersPanel } from '@/components/disposition/buyers-panel';
import { CampaignPanel } from '@/components/disposition/campaign-panel';
import { OffersPanel } from '@/components/disposition/offers-panel';
import { ClosingPanel } from '@/components/disposition/closing-panel';
import { UnderwritingCard } from '@/components/disposition/underwriting-card';
import { TaxSalePanel } from '@/components/disposition/tax-sale-panel';
import { SellerConsentCard } from '@/components/disposition/seller-consent-card';
import { ELIGIBILITY_LABEL, ELIGIBILITY_VARIANT, day, errorText, type Workspace } from '@/lib/disposition';
import { MAPLIBRE_WORKER_URL } from '@/lib/maplibre';

const MapGL = dynamic(() => import('react-map-gl/maplibre').then((m) => m.default), { ssr: false });
const Marker = dynamic(() => import('react-map-gl/maplibre').then((m) => m.Marker), { ssr: false });

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

/**
 * The Deal Command Center (docs/contract-flipping.md s7): one read of the
 * whole opportunity, the few actions that move it at the top, and a tab per
 * stage of the flip. Every number shown to a buyer is the buyer price; the
 * seller-side figures stay on this page.
 */
export default function DealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [tab, setTab] = useState('overview');
  const workspace = useApiQuery<Workspace>(`/deals/${id}/workspace`, { enabled: !!id });
  const timeline = useApiQuery<TimelineEvent[]>(`/timeline/DEAL/${id}`, { enabled: !!id && tab === 'timeline' });
  const underwriting = useApiQuery<UnderwritingResult | null>(`/underwriting/result/${id}`, {
    enabled: !!id,
    retry: false,
  });
  const reload = () => {
    qc.invalidateQueries({ queryKey: [`/deals/${id}/workspace`] });
    qc.invalidateQueries({ queryKey: [`/timeline/DEAL/${id}`] });
  };
  const analyze = useApiMutation(() => apiJson(`/underwriting/analyze/${id}`, { method: 'POST' }), {
    onSuccess: () => {
      toast.success('Underwriting analysis queued');
      qc.invalidateQueries({ queryKey: [`/underwriting/result/${id}`] });
    },
    onError: (err) => toast.error('Failed to run underwriting', { description: errorText(err) }),
  });

  if (workspace.isPending) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Loading…" />
        <LoadingState />
      </div>
    );
  }
  if (workspace.isError || !workspace.data) {
    return (
      <div className="space-y-6 p-6">
        <PageHeader title="Deal not found" />
        <ErrorState
          title="Could not load this deal"
          description={workspace.error ? errorText(workspace.error) : "It may have been deleted or you don't have access."}
          onRetry={() => workspace.refetch()}
        />
      </div>
    );
  }

  const ws = workspace.data;
  const deal = ws.deal;
  const hasCoords = deal.property?.latitude && deal.property?.longitude;
  const uwResult = underwriting.data;
  const activeAssignment = ws.assignments.find((a) => a.status !== 'cancelled') ?? null;
  const buyerNames: Record<string, string> = Object.fromEntries([
    ...ws.offers.map((o) => [o.buyerId, o.buyer.name] as const),
    ...ws.matches.map((m) => [m.buyerId, m.name] as const),
  ]);
  const openOffers = ws.offers.filter((o) => o.status === 'received' || o.status === 'countered').length;
  const pending = ws.approvals.agentRuns.length + ws.approvals.messages.length;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title={deal.property?.address || `Deal ${deal.id.slice(0, 8)}`}
        description={deal.property ? `${deal.property.city}, ${deal.property.state}` : undefined}
        actions={
          <>
            <Button asChild variant="outline" size="sm">
              <Link href={`/documents?dealId=${deal.id}`}>
                <FileText size={16} className="mr-2" />
                Documents
              </Link>
            </Button>
            <Badge variant={ELIGIBILITY_VARIANT[ws.eligibility.status]} className="px-3 py-1 text-sm">
              {ELIGIBILITY_LABEL[ws.eligibility.status]}
            </Badge>
            <Badge variant={stageVariant(deal.stage)} className="px-3 py-1 text-sm">
              {deal.stage.replace('_', ' ')}
            </Badge>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <NextActionsCard actions={ws.nextActions} onGo={setTab} />
        </div>
        <Card className="animate-fade-up overflow-hidden" style={{ animationDelay: '60ms' }}>
          <CardContent className="p-0">
            {hasCoords ? (
              <div className="h-48 w-full">
                <MapGL
                  initialViewState={{ latitude: deal.property!.latitude!, longitude: deal.property!.longitude!, zoom: 14 }}
                  mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
                  workerUrl={MAPLIBRE_WORKER_URL}
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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="contract">Contract</TabsTrigger>
          <TabsTrigger value="buyers">Buyers</TabsTrigger>
          <TabsTrigger value="campaign">Campaign</TabsTrigger>
          <TabsTrigger value="offers">Offers {openOffers ? `(${openOffers})` : ''}</TabsTrigger>
          <TabsTrigger value="closing">Closing</TabsTrigger>
          <TabsTrigger value="approvals">Approvals {pending ? `(${pending})` : ''}</TabsTrigger>
          <TabsTrigger value="timeline">Timeline</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <EconomicsCard economics={ws.economics} />
          <Card className="animate-fade-up">
            <CardHeader>
              <CardTitle>Deal Financials</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                {[
                  { label: 'ARV', value: deal.arv },
                  { label: 'Repairs', value: deal.repairEstimate },
                  { label: 'MAO (computed)', value: ws.underwriting?.mao ?? deal.mao },
                  { label: 'Offer to seller', value: deal.offerAmount, highlight: true },
                ].map((f) => (
                  <div key={f.label} className="space-y-1">
                    <p className="text-caption uppercase tracking-wider text-muted-foreground">{f.label}</p>
                    <p className={cn('font-mono text-h3 font-bold', f.highlight ? 'text-primary' : 'text-foreground')}>
                      {f.value != null ? `$${f.value.toLocaleString()}` : '—'}
                    </p>
                  </div>
                ))}
              </div>
              <BuyerPricePanel
                dealId={deal.id}
                buyerPrice={deal.buyerPrice}
                pricing={deal.economics as DealPricing | null}
                onSaved={reload}
              />
            </CardContent>
          </Card>
          <EligibilityCard eligibility={ws.eligibility} compact />
          <UnderwritingCard
            underwriting={ws.underwriting}
            ai={uwResult}
            onRun={() => analyze.mutate(undefined)}
            running={analyze.isPending}
            dealId={deal.id}
            stage={deal.stage}
            offerAmount={deal.offerAmount}
          />
          {deal.leadId && <SellerConsentCard leadId={deal.leadId} dealId={deal.id} />}
        </TabsContent>

        <TabsContent value="contract" className="space-y-4">
          <EligibilityCard eligibility={ws.eligibility} />
          <AgreementPanel dealId={deal.id} agreement={ws.agreement} />
          <TaxSalePanel
            dealId={deal.id}
            acquisitionType={deal.acquisitionType}
            record={ws.taxSale}
            check={ws.eligibility.checks.find((c) => c.key === 'tax_sale_interest')}
          />
          <ContractsPanel
            dealId={deal.id}
            propertyAddress={deal.property?.address}
            lead={deal.lead}
            contracts={(deal.contracts ?? []) as ContractRow[]}
            onChanged={reload}
            assignment={
              activeAssignment && activeAssignment.status === 'draft'
                ? {
                    id: activeAssignment.id,
                    buyerId: activeAssignment.buyerId,
                    buyerName: buyerNames[activeAssignment.buyerId] ?? 'the buyer',
                  }
                : null
            }
          />
        </TabsContent>

        <TabsContent value="buyers">
          <BuyersPanel matches={ws.matches} considered={ws.buyersConsidered} />
        </TabsContent>

        <TabsContent value="campaign">
          <CampaignPanel
            dealId={deal.id}
            campaigns={ws.campaigns}
            pricing={ws.pricing}
            eligibility={ws.eligibility}
            hasExecutedAgreement={ws.agreement?.status === 'executed'}
          />
        </TabsContent>

        <TabsContent value="offers">
          <OffersPanel dealId={deal.id} offers={ws.offers} pricing={ws.pricing} />
        </TabsContent>

        <TabsContent value="closing">
          <ClosingPanel dealId={deal.id} closing={ws.closing} assignments={ws.assignments} buyerNames={buyerNames} />
        </TabsContent>

        <TabsContent value="approvals">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Inbox size={16} className="text-primary" aria-hidden />
                <CardTitle>Waiting for approval</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {pending === 0 ? (
                <EmptyState icon={Inbox} title="Nothing waiting" description="Agent recommendations and message drafts for this deal appear here." />
              ) : (
                <>
                  {ws.approvals.agentRuns.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-caption uppercase tracking-wider text-muted-foreground">Agent recommendations</p>
                      {ws.approvals.agentRuns.map((r) => (
                        <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2">
                          <span className="text-body text-foreground">
                            <Badge variant="outline" className="mr-2">{r.agent}</Badge>
                            {typeof r.summary === 'string' ? r.summary : 'Recommendation'}
                          </span>
                          <Button asChild size="sm" variant="outline">
                            <Link href="/admin/agents">Review</Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                  {ws.approvals.messages.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-caption uppercase tracking-wider text-muted-foreground">Message drafts</p>
                      {ws.approvals.messages.map((m) => (
                        <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2">
                          <span className="text-body text-foreground">
                            <Badge variant="outline" className="mr-2">{m.channel}</Badge>
                            {String(m.type ?? 'message').replace(/_/g, ' ')}
                            {m.buyerName ? ` to ${String(m.buyerName)}` : ''} · {day(m.createdAt)}
                          </span>
                          <Button asChild size="sm" variant="outline">
                            <Link href="/communications">Review</Link>
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </>
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
              {timeline.isPending ? (
                <LoadingState />
              ) : (timeline.data ?? []).length === 0 ? (
                <EmptyState icon={Clock} title="No events" description="Activity will populate here as the deal progresses." />
              ) : (
                <ol className="relative space-y-4 border-l border-border pl-5">
                  {(timeline.data ?? []).map((ev) => (
                    <li key={ev.id} className="relative">
                      <span
                        aria-hidden
                        className="absolute left-[-11px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-primary shadow-glow"
                      />
                      <div className="rounded-md border border-border bg-card/60 px-3 py-2.5">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-body font-medium text-foreground">{ev.eventType}</span>
                          <span className="text-caption text-muted-foreground">{new Date(ev.createdAt).toLocaleString()}</span>
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

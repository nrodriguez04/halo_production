'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useApiQuery } from '@/lib/api-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { MarketOverview } from '@/components/markets/market-overview';
import { PolicyEditor } from '@/components/markets/policy-editor';
import { AuthorizationsCard } from '@/components/markets/authorizations-card';
import { ExpansionProposals } from '@/components/markets/market-agents';
import { day, errorText } from '@/lib/disposition';
import {
  BASIS_LABEL,
  BASIS_VARIANT,
  CLASSIFICATION_LABEL,
  STATUS_LABEL,
  STATUS_VARIANT,
  TEMPLATE_KIND_LABEL,
  type MarketDetail,
} from '@/lib/markets';

/** One market: status and ladder, the policy and its approvals, authorizations, templates. */
export default function MarketPage() {
  const { state } = useParams<{ state: string }>();
  const code = String(state).toUpperCase();
  const m = useApiQuery<MarketDetail>(`/markets/${code}`);
  const [tab, setTab] = useState('overview');

  if (m.isPending) return <LoadingState />;
  if (m.isError) return <ErrorState title="Could not load the market" description={errorText(m.error)} onRetry={() => m.refetch()} />;
  const d = m.data;

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow={
          <Link href="/markets" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft size={12} aria-hidden /> Market activation
          </Link>
        }
        title={`${d.name} (${d.state})`}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={STATUS_VARIANT[d.effectiveStatus]}>{STATUS_LABEL[d.effectiveStatus]}</Badge>
            <span>{CLASSIFICATION_LABEL[d.classification]}</span>
            {d.approvalBasis ? (
              <Badge variant={BASIS_VARIANT[d.approvalBasis]}>{BASIS_LABEL[d.approvalBasis]}</Badge>
            ) : (
              <span className="text-muted-foreground">(proposed, not reviewed)</span>
            )}
            {d.openDeals > 0 && <span>{d.openDeals} open deal(s)</span>}
          </span>
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="policy">Policy</TabsTrigger>
          <TabsTrigger value="authorizations">Licences {d.authorizations.length ? `(${d.authorizations.length})` : ''}</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="versions">Versions {d.versions.length ? `(${d.versions.length})` : ''}</TabsTrigger>
          <TabsTrigger value="agent">Expansion agent</TabsTrigger>
        </TabsList>
        <TabsContent value="overview">
          <MarketOverview m={d} />
        </TabsContent>
        <TabsContent value="policy">
          <PolicyEditor m={d} />
        </TabsContent>
        <TabsContent value="agent">
          <ExpansionProposals
            state={d.state}
            questionLabel={(k) => d.questions.find((q) => q.key === k)?.label ?? k.replace(/_/g, ' ')}
          />
        </TabsContent>
        <TabsContent value="authorizations">
          <AuthorizationsCard m={d} />
        </TabsContent>
        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <CardTitle>Templates that apply to {d.name}</CardTitle>
                <Button asChild size="sm" variant="outline">
                  <Link href="/templates">Manage templates</Link>
                </Button>
              </div>
              <CardDescription>Only an approved version generates documents. Validated versions count toward technical readiness.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {d.templates.length === 0 && <p className="text-caption text-muted-foreground">None yet.</p>}
              {d.templates.map((t) => (
                <div key={`${t.kind}-${t.status}-${t.version}-${t.name}`} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
                  <div>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-caption text-muted-foreground">
                      {TEMPLATE_KIND_LABEL[t.kind] ?? t.kind} · v{t.version} · {t.specific ? `written for ${d.state}` : 'approved for all states'}
                    </p>
                  </div>
                  <Badge variant={t.status === 'approved' ? 'success' : 'outline'}>{t.status}</Badge>
                </div>
              ))}
              <div className="pt-2">
                <p className="font-medium">Technical readiness</p>
                <ul className="mt-1 space-y-1">
                  {d.technical.checks.map((c) => (
                    <li key={c.key} className="text-caption">
                      <span className={c.met ? 'text-emerald-400' : 'text-amber-400'}>{c.met ? '✓' : '○'}</span> {c.label}:{' '}
                      <span className="text-muted-foreground">{c.detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="versions">
          <Card>
            <CardHeader>
              <CardTitle>Approved versions</CardTitle>
              <CardDescription>
                Each is the policy exactly as it was approved by counsel or accepted by the owner, and says which. The newest current one is in force.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {d.versions.length === 0 && <p className="text-caption text-muted-foreground">Nothing approved yet.</p>}
              {d.versions.map((v) => (
                <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
                  <div>
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span>
                        v{v.version} · class {v.classification} ·{' '}
                        {v.basis === 'counsel' ? `${v.counselName}${v.counselFirm ? `, ${v.counselFirm}` : ''}` : `accepted by ${v.acceptedByName}`}
                      </span>
                      <Badge variant={BASIS_VARIANT[v.basis]}>{BASIS_LABEL[v.basis]}</Badge>
                    </p>
                    <p className="text-caption text-muted-foreground">
                      {v.basis === 'counsel' ? 'approved' : 'accepted'} {day(v.approvedAt)} · review until {day(v.reviewExpiresAt)}
                      {v.memoDocumentId && (
                        <>
                          {' · '}
                          <Link href={`/documents?q=${v.memoDocumentId}`} className="underline-offset-2 hover:underline">
                            memo
                          </Link>
                        </>
                      )}
                    </p>
                    {v.acceptanceReason && <p className="text-caption text-muted-foreground">Why: {v.acceptanceReason}</p>}
                  </div>
                  <Badge variant={v.supersededAt ? 'outline' : 'success'}>{v.supersededAt ? `superseded ${day(v.supersededAt)}` : 'in force'}</Badge>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

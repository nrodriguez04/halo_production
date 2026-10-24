'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Database, Globe2, Rocket, Search, Wrench } from 'lucide-react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { ErrorState, LoadingState } from '@/components/states';
import { toast } from '@/components/ui/toast';
import { errorText } from '@/lib/disposition';
import {
  BASIS_LABEL,
  CHANNEL_SHORT,
  PERMISSION_VARIANT,
  STATUS_LABEL,
  STATUS_VARIANT,
  STRUCTURE_SHORT,
  TEMPLATE_KIND_LABEL,
  type ActivationStatus,
  type MarketMatrix,
  type MarketRow,
} from '@/lib/markets';

function Kpi({
  icon: Icon,
  label,
  value,
  total,
  detail,
}: {
  icon: typeof Globe2;
  label: string;
  value: number;
  total: number;
  detail: string;
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-4">
        <div className="flex items-center gap-2 text-caption uppercase tracking-wider text-muted-foreground">
          <Icon size={14} aria-hidden />
          {label}
        </div>
        <p className="font-mono text-h2 font-bold">
          {value}
          <span className="text-body font-normal text-muted-foreground"> / {total}</span>
        </p>
        <p className="text-caption text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function Perms({ items, labels }: { items: MarketRow['structures']; labels: Record<string, string> }) {
  const shown = items.filter((i) => i.permission !== 'unknown');
  if (!shown.length) return <span className="text-caption text-muted-foreground">unknown</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((i) => (
        <Badge key={i.key} variant={PERMISSION_VARIANT[i.permission]} title={`${labels[i.key] ?? i.key}: ${i.permission}`}>
          {labels[i.key] ?? i.key}
          {i.permission === 'conditional' ? '*' : i.permission === 'prohibited' ? ' ✕' : ''}
        </Badge>
      ))}
    </div>
  );
}

/**
 * The Nationwide Market Activation Matrix (docs/markets.md): all 50 states
 * and DC, with legal classification, structures, requirements, disclosures,
 * channels, templates, deadlines, sources, counsel review, readiness and
 * activation, and the three coverage measures kept apart.
 */
export default function MarketsPage() {
  const matrix = useApiQuery<MarketMatrix>('/markets');
  const router = useRouter();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [region, setRegion] = useState('');
  const [status, setStatus] = useState('');
  const [cls, setCls] = useState('');

  const importResearch = useApiMutation<void, { imported: string[]; skipped: Array<{ state: string; reason: string }> }>(
    () => apiJson('/markets/research/import', { method: 'POST', body: JSON.stringify({}) }),
    {
      onSuccess: (out) => {
        toast.success(`Research loaded into ${out.imported.length} draft(s)`, {
          description: out.skipped.length ? `${out.skipped.length} left alone: edited by a person or with counsel.` : undefined,
        });
        qc.invalidateQueries({ queryKey: ['/markets'] });
      },
      onError: (err) => toast.error('Could not import research', { description: errorText(err) }),
    },
  );

  const rows = useMemo(() => {
    const all = matrix.data?.rows ?? [];
    const needle = q.trim().toLowerCase();
    return all.filter(
      (r) =>
        (!needle || r.name.toLowerCase().includes(needle) || r.state.toLowerCase() === needle) &&
        (!region || r.region === region) &&
        (!status || r.effectiveStatus === status) &&
        (!cls || r.classification === cls),
    );
  }, [matrix.data, q, region, status, cls]);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow="Compliance"
        title="Market activation"
        description="Every state and DC. A market operates only as far as its approved policy (approved by counsel, or accepted by the owner and labelled so), its requirements and a person's decision allow. Unknown never means allowed."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" loading={importResearch.isPending} onClick={() => importResearch.mutate()}>
              Load bundled research into drafts
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/templates">Templates</Link>
            </Button>
          </div>
        }
      />
      {matrix.isPending ? (
        <LoadingState />
      ) : matrix.isError ? (
        <ErrorState title="Could not load markets" description={errorText(matrix.error)} onRetry={() => matrix.refetch()} />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-3">
            <Kpi
              icon={Database}
              label="Research coverage"
              value={matrix.data.kpis.research.count}
              total={matrix.data.kpis.total}
              detail={`Research on file: ${matrix.data.kpis.research.withResearch}. Property data access: ${matrix.data.kpis.research.withDataAccess}${matrix.data.dataAccess.providers.length ? ` (${matrix.data.dataAccess.providers.join(', ')})` : ' (no data provider key configured)'}.`}
            />
            <Kpi
              icon={Wrench}
              label="Technical readiness"
              value={matrix.data.kpis.technical.count}
              total={matrix.data.kpis.total}
              detail="Rules encoded, templates with valid fields for the state, and a passing self-test. Independent of legal approval."
            />
            <Kpi
              icon={Rocket}
              label="Active transaction markets"
              value={matrix.data.kpis.active.count}
              total={matrix.data.kpis.total}
              detail={`Approved by counsel or accepted by the owner, requirements met and activated by a person. ${matrix.data.kpis.active.transactionEnabled} may sign seller contracts.`}
            />
          </div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle>By status</CardTitle>
              <CardDescription>Effective status: the lower of what a person set and what the approved policy and requirements support.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {(Object.keys(STATUS_LABEL) as ActivationStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(status === s ? '' : s)}
                  className="rounded-md focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Badge variant={status === s ? 'default' : STATUS_VARIANT[s]}>
                    {STATUS_LABEL[s]}: {matrix.data.kpis.byStatus[s]}
                  </Badge>
                </button>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search size={14} className="absolute left-2 top-2.5 text-muted-foreground" aria-hidden />
                  <Input className="w-56 pl-7" placeholder="State or code" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search states" />
                </div>
                <Select className="w-40" value={region} onChange={(e) => setRegion(e.target.value)} aria-label="Region">
                  <option value="">All regions</option>
                  {['Northeast', 'Midwest', 'South', 'West'].map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </Select>
                <Select className="w-44" value={cls} onChange={(e) => setCls(e.target.value)} aria-label="Classification">
                  <option value="">All classifications</option>
                  {['A', 'B', 'C', 'D', 'E', 'unclassified'].map((c) => (
                    <option key={c} value={c}>
                      {c === 'unclassified' ? 'Not classified' : `Class ${c}`}
                    </option>
                  ))}
                </Select>
                <span className="text-caption text-muted-foreground">{rows.length} shown</span>
              </div>
            </CardHeader>
            <CardContent className="overflow-x-auto p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>State</TableHead>
                    <TableHead>Class</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Approval</TableHead>
                    <TableHead>Structures</TableHead>
                    <TableHead>Channels</TableHead>
                    <TableHead>Requirements</TableHead>
                    <TableHead>Disclosures &amp; deadlines</TableHead>
                    <TableHead>Templates</TableHead>
                    <TableHead>Sources</TableHead>
                    <TableHead>Ready</TableHead>
                    <TableHead className="min-w-64">Next step</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.state} className="cursor-pointer" onClick={() => router.push(`/markets/${r.state}`)}>
                      <TableCell>
                        <Link href={`/markets/${r.state}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                          {r.name}
                        </Link>
                        <div className="text-caption text-muted-foreground">
                          {r.state} · {r.region}
                          {r.openDeals ? ` · ${r.openDeals} open deal(s)` : ''}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.classificationSource === 'approved' ? 'default' : 'outline'} title={r.approvalBasis ? BASIS_LABEL[r.approvalBasis] : 'Proposed in the draft, not reviewed'}>
                          {r.classification === 'unclassified' ? '—' : r.classification}
                        </Badge>
                        {r.classificationSource === 'draft' && r.classification !== 'unclassified' && (
                          <div className="text-caption text-muted-foreground">proposed</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className="whitespace-nowrap" variant={STATUS_VARIANT[r.effectiveStatus]}>{STATUS_LABEL[r.effectiveStatus]}</Badge>
                        {r.requestedStatus !== r.effectiveStatus && !['RESEARCH_ONLY'].includes(r.requestedStatus) && (
                          <div className="text-caption text-muted-foreground">set: {STATUS_LABEL[r.requestedStatus]}</div>
                        )}
                      </TableCell>
                      <TableCell className="text-caption">
                        {r.legal.state === 'approved' || r.legal.state === 'expired' ? (
                          <>
                            v{r.legal.version} · {r.legal.basis === 'owner_risk_acceptance' ? 'owner-accepted, not counsel' : r.legal.counselName}
                            <div className={r.legal.state === 'expired' ? 'text-destructive' : 'text-muted-foreground'}>
                              {r.legal.state === 'expired' ? 'lapsed ' : 'until '}
                              {r.legal.reviewExpiresAt?.slice(0, 10) ?? '—'}
                            </div>
                          </>
                        ) : r.legal.state === 'in_review' ? (
                          <Badge variant="info">with counsel</Badge>
                        ) : (
                          <span className="text-muted-foreground">
                            {r.research.date ? `research ${r.research.date} (${r.research.confidence})` : 'none'}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Perms items={r.structures} labels={STRUCTURE_SHORT} />
                      </TableCell>
                      <TableCell>
                        <Perms items={r.channels} labels={CHANNEL_SHORT} />
                      </TableCell>
                      <TableCell className="text-caption">
                        {r.requirements.length === 0 ? (
                          <span className="text-muted-foreground">none listed</span>
                        ) : (
                          r.requirements.map((q) => (
                            <div key={q.key} className={q.met ? 'text-emerald-400' : 'text-amber-400'}>
                              {q.met ? '✓' : '○'} {q.label}
                            </div>
                          ))
                        )}
                      </TableCell>
                      <TableCell className="text-caption">
                        <div>{r.disclosures.length ? `${r.disclosures.length} disclosure(s)` : 'no disclosures'}</div>
                        {r.deadlines.map((dl) => (
                          <div key={dl.key} className="text-muted-foreground">
                            {dl.label}: {dl.days} {dl.businessDays ? 'business' : 'calendar'} days
                          </div>
                        ))}
                      </TableCell>
                      <TableCell className="text-caption">
                        {r.templates.length === 0 ? (
                          <span className="text-muted-foreground">none</span>
                        ) : (
                          r.templates.map((t) => (
                            <div key={`${t.kind}-${t.status}-${t.version}`} className={t.status === 'approved' ? 'text-emerald-400' : 'text-muted-foreground'}>
                              {TEMPLATE_KIND_LABEL[t.kind] ?? t.kind} ({t.status})
                            </div>
                          ))
                        )}
                      </TableCell>
                      <TableCell className="text-caption">
                        {r.sources.count} ({r.sources.official} official)
                        {r.sources.latestEffectiveDate && (
                          <div className="text-muted-foreground">latest {r.sources.latestEffectiveDate}</div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={r.technical.ready ? 'success' : 'outline'}>{r.technical.ready ? 'ready' : `${r.technical.checks.filter((c) => !c.met).length} to do`}</Badge>
                      </TableCell>
                      <TableCell className="text-caption text-muted-foreground">{r.nextStep ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

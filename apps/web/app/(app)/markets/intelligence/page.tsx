'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronDown, ChevronRight, Compass } from 'lucide-react';
import { useApiQuery } from '@/lib/api-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { errorText, money } from '@/lib/disposition';
import { STATUS_LABEL, STATUS_VARIANT, type ActivationStatus } from '@/lib/markets';
import { MarketBriefCard } from '@/components/markets/market-agents';

interface Component {
  key: string;
  label: string;
  points: number;
  max: number;
  basis: 'recorded' | 'halo' | 'policy' | 'estimate' | 'unknown';
  detail: string;
}

type Level = 'metro' | 'county' | 'zip';

const LEVEL_PLURAL: Record<Level, string> = { metro: 'metros', county: 'counties', zip: 'zips' };

interface Geo {
  level: Level;
  key: string;
  label: string;
  state: string;
  sales12m: number;
  medianPrice: number | null;
  distinctInvestors12m: number;
  distressLeads: number;
  score: number;
  opportunity: number;
  marketStatus: ActivationStatus | null;
  components: Component[];
}

interface Recommendation {
  state: string;
  opportunity: number;
  feasibility: number;
  priority: number;
  status: ActivationStatus;
  classification: string;
  classificationProposed?: boolean;
  topGeos: Array<{ key: string; label: string; opportunity: number }>;
  reasons: string[];
  nextStep: string | null;
}

const BASIS_VARIANT = { recorded: 'success', halo: 'primary-soft', policy: 'info', estimate: 'warning', unknown: 'outline' } as const;

/**
 * Market intelligence (docs/data-pipeline.md s5): where to work and which
 * states to activate next. Research is allowed everywhere, so this covers
 * every jurisdiction Halo holds data for, whatever its legal status.
 */
export default function MarketIntelligencePage() {
  const [level, setLevel] = useState<Level>('county');
  const [state, setState] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const recs = useApiQuery<{ recommendations: Recommendation[]; dataCoverage: { counties: number; states: number } }>(
    '/market-intelligence/recommendations',
    { params: { limit: 12 } },
  );
  const geos = useApiQuery<{ total: number; geos: Geo[] }>('/market-intelligence', {
    params: { level, limit: 100, ...(state.trim().length === 2 ? { state: state.trim().toUpperCase() } : {}) },
  });

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow={
          <Link href="/markets" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft size={12} aria-hidden /> Market activation
          </Link>
        }
        title="Market intelligence"
        description="Metros, counties and zips ranked from recorded sales and Halo's own leads and closings, and the states worth activating next. Every point names its basis; estimates are labelled as such."
      />

      <MarketBriefCard
        scope={state.trim().length === 2 ? state.trim().toUpperCase() : 'US'}
        scopeLabel={state.trim().length === 2 ? state.trim().toUpperCase() : 'nationwide'}
      />

      <Card>
        <CardHeader>
          <CardTitle>Activate next</CardTitle>
          <CardDescription>
            Priority is opportunity (the best counties, legal standing aside) times how close the state is to operating lawfully. A recommendation is for people to act on; it never activates anything.
            {recs.data && ` Data covers ${recs.data.dataCoverage.counties} county(ies) in ${recs.data.dataCoverage.states} state(s).`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {recs.isPending ? (
            <LoadingState />
          ) : recs.isError ? (
            <ErrorState title="Could not load" description={errorText(recs.error)} onRetry={() => recs.refetch()} />
          ) : (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {recs.data.recommendations.map((r) => (
                <Link key={r.state} href={`/markets/${r.state}`} className="block rounded-md border border-border p-3 hover:bg-secondary/40">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">
                      {r.state}{' '}
                      <span className="text-muted-foreground">
                        class {r.classification}
                        {r.classificationProposed ? ' (proposed)' : ''}
                      </span>
                    </p>
                    <Badge variant={STATUS_VARIANT[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                  </div>
                  <p className="mt-1 font-mono text-caption">
                    priority {r.priority} · opportunity {r.opportunity} · feasibility {r.feasibility}
                  </p>
                  {r.reasons.map((x) => (
                    <p key={x} className="text-caption text-muted-foreground">
                      {x}
                    </p>
                  ))}
                  {r.nextStep && <p className="mt-1 text-caption">Next: {r.nextStep}</p>}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle className="mr-2">Ranked {LEVEL_PLURAL[level]}</CardTitle>
            <Select className="w-32" value={level} onChange={(e) => setLevel(e.target.value as Level)} aria-label="Level">
              <option value="metro">Metros</option>
              <option value="county">Counties</option>
              <option value="zip">Zips</option>
            </Select>
            <Input className="w-24 uppercase" maxLength={2} placeholder="State" value={state} onChange={(e) => setState(e.target.value)} aria-label="State" />
            {geos.data && <span className="text-caption text-muted-foreground">{geos.data.total} with recorded sales</span>}
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {geos.isPending ? (
            <LoadingState />
          ) : geos.isError ? (
            <ErrorState title="Could not load" description={errorText(geos.error)} onRetry={() => geos.refetch()} />
          ) : geos.data.geos.length === 0 ? (
            <EmptyState
              icon={Compass}
              title="No recorded sales yet"
              description="Import a county recorded-sales export on the Buyer discovery page, or pull an area from ATTOM once its key is configured."
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-6" />
                  <TableHead>Area</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Opportunity</TableHead>
                  <TableHead>Sales (12 mo)</TableHead>
                  <TableHead>Median price</TableHead>
                  <TableHead>Investors</TableHead>
                  <TableHead>Distress leads</TableHead>
                  <TableHead>Market</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {geos.data.geos.map((g) => (
                  <Fragment key={g.key}>
                    <TableRow className="cursor-pointer" onClick={() => setOpen(open === g.key ? null : g.key)}>
                      <TableCell>{open === g.key ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</TableCell>
                      <TableCell className="font-medium">{g.label}</TableCell>
                      <TableCell className="font-mono">{g.score}</TableCell>
                      <TableCell className="font-mono">{g.opportunity}</TableCell>
                      <TableCell>{g.sales12m}</TableCell>
                      <TableCell>{money(g.medianPrice)}</TableCell>
                      <TableCell>{g.distinctInvestors12m}</TableCell>
                      <TableCell>{g.distressLeads}</TableCell>
                      <TableCell>
                        {g.marketStatus ? <Badge className="whitespace-nowrap" variant={STATUS_VARIANT[g.marketStatus]}>{STATUS_LABEL[g.marketStatus]}</Badge> : '—'}
                      </TableCell>
                    </TableRow>
                    {open === g.key && (
                      <TableRow>
                        <TableCell />
                        <TableCell colSpan={8}>
                          <ul className="grid gap-1 md:grid-cols-2">
                            {g.components.map((c) => (
                              <li key={c.key} className="text-caption">
                                <span className="font-mono">
                                  {c.points}/{c.max}
                                </span>{' '}
                                <span className="font-medium">{c.label}</span> <Badge variant={BASIS_VARIANT[c.basis]}>{c.basis}</Badge>{' '}
                                <span className="text-muted-foreground">{c.detail}</span>
                              </li>
                            ))}
                          </ul>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

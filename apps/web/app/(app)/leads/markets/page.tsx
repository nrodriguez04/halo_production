'use client';

import { Fragment, useMemo, useState, type ChangeEvent } from 'react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { LISTING_SOURCES, sourceDef, sourceLabel } from '@/lib/listing-sources';
import { errorText } from '@/lib/disposition';
import { ASSET_CLASS_LABEL, isAssetClass, type AssetClass } from '@/lib/assets';
import {
  commercialCriteriaFrom,
  countyMarketLabel,
  criteriaProblems,
  emptyCommercialForm,
  emptyLandForm,
  landCriteriaFrom,
  listOf,
  totals,
  type CommercialCriteria,
  type CommercialForm,
  type LandCriteria,
  type LandForm,
  type MarketResult,
} from '@/lib/sourcing';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';
import { AutoEnrichCard } from '@/components/leads/auto-enrich-card';
import { LoadingState, EmptyState, ErrorState, SkeletonTable } from '@/components/states';
import { AssetClassPicker, CommercialCriteriaFields, LandCriteriaFields } from '@/components/sourcing/criteria-fields';
import { SourcingEstimatePanel } from '@/components/sourcing/estimate-panel';
import { RunOutcome, SmallBatchControl } from '@/components/sourcing/run-outcome';
import { Globe, Play, Plus, Trash2 } from 'lucide-react';

interface Market {
  id: string;
  label: string;
  state: string;
  city: string | null;
  postalCode: string | null;
  sources: string[];
  /** Empty for a market saved before asset classes: residential. */
  assetClasses?: string[];
  criteria: (Record<string, unknown> & { land?: LandCriteria; commercial?: CommercialCriteria }) | null;
  cadence: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRunAt: string | null;
  lastResult: MarketResult | null;
}

interface SourcingRun {
  id: string;
  entityId: string | null;
  status: string;
  triggerType: string;
  createdAt: string;
  completedAt: string | null;
  outputJson: MarketResult | null;
  errorJson: unknown;
}

const CADENCES = ['daily', 'weekly', 'manual'];
const METRO_COUNTS = [10, 25, 50];

const emptyForm = {
  label: '',
  state: '',
  city: '',
  postalCode: '',
  sources: ['rentcast', 'realie'] as string[],
  assetClasses: ['residential'] as AssetClass[],
  status: '',
  minDaysOnMarket: '',
  maxPrice: '',
  transferredWithinDays: '',
  limit: '50',
  cadence: 'daily',
  /** Once a person picks a cadence, choosing asset classes no longer changes it. */
  cadenceChosen: false,
  land: emptyLandForm as LandForm,
  commercial: emptyCommercialForm as CommercialForm,
};
type MarketForm = typeof emptyForm;

const emptyMetros = { count: '25', sources: ['rentcast', 'realie'] as string[], cadence: 'daily' };
type MetrosForm = typeof emptyMetros;

const when = (iso: string | null | undefined, fallback: string) =>
  iso ? new Date(iso).toLocaleString() : fallback;
const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

function criteriaFromForm(form: MarketForm) {
  return {
    status: form.status ? [form.status] : undefined,
    minDaysOnMarket: num(form.minDaysOnMarket),
    maxPrice: num(form.maxPrice),
    transferredWithinDays: num(form.transferredWithinDays),
    limit: num(form.limit) ?? 50,
    land: form.assetClasses.includes('land') ? landCriteriaFrom(form.land) : undefined,
    commercial: form.assetClasses.includes('commercial') ? commercialCriteriaFrom(form.commercial) : undefined,
  };
}

/** The counties the form names for the classes it looks for. */
function formCounties(form: MarketForm): string[] {
  return Array.from(
    new Set([
      ...(form.assetClasses.includes('land') ? listOf(form.land.counties) : []),
      ...(form.assetClasses.includes('commercial') ? listOf(form.commercial.counties) : []),
    ]),
  );
}

/** Everything that would stop the market being saved, in words. */
function formProblems(form: MarketForm): string[] {
  const out: string[] = [];
  if (form.postalCode.trim() && !/^\d{5}$/.test(form.postalCode.trim())) out.push('A ZIP is five digits.');
  if (form.state.trim() && !/^[A-Za-z]{2}$/.test(form.state.trim())) out.push('Use the two-letter state code, such as TX.');
  if (form.assetClasses.includes('land')) out.push(...criteriaProblems('land', form.land));
  if (form.assetClasses.includes('commercial')) out.push(...criteriaProblems('commercial', form.commercial));
  return out;
}

function marketClasses(m: Market): AssetClass[] {
  const list = (m.assetClasses ?? []).filter(isAssetClass);
  return list.length ? list : ['residential'];
}

/** "Houston, TX" or "Travis, Hays counties, TX". */
function marketArea(m: Market): string {
  const counties = Array.from(new Set([...(m.criteria?.land?.counties ?? []), ...(m.criteria?.commercial?.counties ?? [])]));
  const place = m.city ?? m.postalCode;
  const parts = [place, counties.length ? `${counties.join(', ')} ${counties.length === 1 ? 'county' : 'counties'}` : null, m.state];
  return parts.filter(Boolean).join(', ');
}

function OutcomeBadges({ result }: { result: MarketResult | null }) {
  if (!result) return <span className="text-muted-foreground">never</span>;
  if (result.skipped) return <Badge variant="warning">skipped: {result.skipped}</Badge>;
  const t = totals(result);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 font-medium">{result.created} new</span>
      {result.outcomes.map((o) => (
        <Badge
          key={o.source}
          variant={o.ok ? 'success' : 'destructive'}
          title={
            o.ok
              ? `${o.searched} searched, ${o.duplicates} duplicates${o.filtered != null ? `, ${o.filtered} set aside by filters` : ''}`
              : o.error
          }
        >
          {sourceLabel(o.source)}
          {o.ok ? ` +${o.created}` : ' failed'}
        </Badge>
      ))}
      {t.reported && t.filtered > 0 && <span className="text-xs text-muted-foreground">{t.filtered} set aside</span>}
      {t.unclassified > 0 && <span className="text-xs text-amber-400">{t.unclassified} to confirm</span>}
      {result.batchLimit && <span className="text-xs text-muted-foreground">small batch</span>}
    </div>
  );
}

export default function MarketsPage() {
  const queryClient = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [metrosOpen, setMetrosOpen] = useState(false);
  const [form, setForm] = useState<MarketForm>(emptyForm);
  const [metros, setMetros] = useState<MetrosForm>(emptyMetros);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [batchingId, setBatchingId] = useState<string | null>(null);
  /** The result of a run started from this page, shown under its market until dismissed. */
  const [shown, setShown] = useState<Record<string, MarketResult>>({});

  const markets = useApiQuery<Market[]>('/sourcing/markets');
  const runs = useApiQuery<SourcingRun[]>('/sourcing/runs', { params: { limit: 20 } });

  const marketLabel = useMemo(() => {
    const byId = new Map((markets.data ?? []).map((m) => [m.id, m.label]));
    return (id: string | null) => (id && byId.get(id)) || 'removed market';
  }, [markets.data]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['/sourcing/markets'] });
    queryClient.invalidateQueries({ queryKey: ['/sourcing/runs'] });
  };
  const fail = (title: string) => (err: unknown) => toast.error(title, { description: errorText(err) });

  const createMutation = useApiMutation<MarketForm, Market>(
    (f) => {
      const counties = formCounties(f);
      const hasArea = !!(f.city.trim() || f.postalCode.trim());
      return apiJson<Market>('/sourcing/markets', {
        method: 'POST',
        body: JSON.stringify({
          label: f.label.trim() || (!hasArea && counties.length ? countyMarketLabel(f.state, counties, f.assetClasses) : undefined),
          state: f.state.trim().toUpperCase(),
          city: f.city.trim() || undefined,
          postalCode: f.postalCode.trim() || undefined,
          sources: f.sources,
          assetClasses: f.assetClasses,
          cadence: f.cadence,
          criteria: criteriaFromForm(f),
        }),
      });
    },
    {
      onSuccess: (market) => {
        toast.success(`Market added: ${market.label}`, {
          description:
            market.cadence === 'manual' ? 'It runs only when you run it. Try a small batch first to see what comes back.' : undefined,
        });
        setAddOpen(false);
        setForm(emptyForm);
        refresh();
      },
      onError: fail('Could not add the market'),
    },
  );

  const metrosMutation = useApiMutation<MetrosForm, { created: Market[]; skipped: string[] }>(
    (f) =>
      apiJson('/sourcing/markets/metros', {
        method: 'POST',
        body: JSON.stringify({ count: Number(f.count), sources: f.sources, cadence: f.cadence }),
      }),
    {
      onSuccess: (out) => {
        toast.success(`${out.created.length} markets added`, {
          description: out.skipped.length ? `${out.skipped.length} were already set up` : undefined,
        });
        setMetrosOpen(false);
        refresh();
      },
      onError: fail('Could not add the metros'),
    },
  );

  const toggleMutation = useApiMutation<{ id: string; enabled: boolean }, Market>(
    ({ id, enabled }) =>
      apiJson<Market>(`/sourcing/markets/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ enabled }),
      }),
    { onSuccess: refresh, onError: fail('Could not update the market') },
  );

  const runMutation = useApiMutation<{ id: string; limit?: number }, MarketResult>(
    ({ id, limit }) =>
      apiJson<MarketResult>(`/sourcing/markets/${id}/run`, {
        method: 'POST',
        body: JSON.stringify(limit ? { limit } : {}),
      }),
    {
      onMutate: ({ id, limit }) => (limit ? setBatchingId(id) : setRunningId(id)),
      onSuccess: (result, { id }) => {
        setShown((s) => ({ ...s, [id]: result }));
        const t = totals(result);
        toast.success(
          result.skipped
            ? `Pull skipped: ${result.skipped}`
            : `${result.created} new lead${result.created === 1 ? '' : 's'} from this ${result.batchLimit ? 'small batch' : 'pull'}`,
          {
            description: result.skipped
              ? undefined
              : [
                  ...result.outcomes.map((o) => `${sourceLabel(o.source)}: ${o.ok ? `${o.created} new` : o.error}`),
                  t.reported ? `${t.filtered} set aside by filters` : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
          },
        );
        queryClient.invalidateQueries({ queryKey: ['/leads'] });
      },
      onError: fail('Pull failed'),
      onSettled: () => {
        setRunningId(null);
        setBatchingId(null);
        refresh();
      },
    },
  );

  const removeMutation = useApiMutation<string, unknown>(
    (id) => apiJson(`/sourcing/markets/${id}`, { method: 'DELETE' }),
    { onSuccess: refresh, onError: fail('Could not remove the market') },
  );

  const setField =
    (field: 'label' | 'state' | 'city' | 'postalCode' | 'status' | 'minDaysOnMarket' | 'maxPrice' | 'transferredWithinDays' | 'limit') =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [field]: e.target.value }));
  const toggleSource = (list: string[], value: string, on: boolean) =>
    on ? Array.from(new Set([...list, value])) : list.filter((s) => s !== value);
  // Land and commercial start manual: run a small batch, check it, then schedule it.
  const setAssetClasses = (assetClasses: AssetClass[]) =>
    setForm((f) => ({
      ...f,
      assetClasses,
      cadence: f.cadenceChosen ? f.cadence : assetClasses.some((c) => c !== 'residential') ? 'manual' : 'daily',
    }));

  const singleSource = form.sources.length === 1 ? sourceDef(form.sources[0]) : null;
  const usesRealie = form.sources.includes('realie');
  const usesListings = form.sources.some((s) => s !== 'realie');
  const metroCalls = Number(metros.count) * metros.sources.length;
  const nonResidential = form.assetClasses.some((c) => c !== 'residential');
  const counties = formCounties(form);
  const hasArea = !!(form.city.trim() || form.postalCode.trim()) || counties.length > 0;
  const problems = formProblems(form);

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Markets"
        description="Standing sourcing instructions. Every enabled market is pulled on its cadence through the same import path as a manual pull."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setMetrosOpen(true)}>
              <Globe size={16} className="mr-2" />
              Add top metros
            </Button>
            <Button size="sm" onClick={() => setAddOpen(true)}>
              <Plus size={16} className="mr-2" />
              Add market
            </Button>
          </>
        }
      />

      <AutoEnrichCard />

      {markets.isPending ? (
        <LoadingState skeleton>
          <SkeletonTable rows={5} cols={6} />
        </LoadingState>
      ) : markets.isError ? (
        <ErrorState
          title="Couldn't load markets"
          description={markets.error?.message}
          onRetry={() => markets.refetch()}
        />
      ) : (markets.data ?? []).length === 0 ? (
        <EmptyState
          title="No markets yet"
          description="Add a city, ZIP or county to pull from, or add the largest metros in one click."
          action={
            <Button size="sm" onClick={() => setMetrosOpen(true)}>
              <Globe size={16} className="mr-2" />
              Add top metros
            </Button>
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>
              {markets.data!.length} market{markets.data!.length === 1 ? '' : 's'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Market</TableHead>
                  <TableHead>Sources</TableHead>
                  <TableHead>Cadence</TableHead>
                  <TableHead>Last pull</TableHead>
                  <TableHead>Next pull</TableHead>
                  <TableHead>On</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {markets.data!.map((m) => (
                  <Fragment key={m.id}>
                    <TableRow>
                      <TableCell>
                        <div className="font-medium">{m.label}</div>
                        <div className="text-xs text-muted-foreground">{marketArea(m)}</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {marketClasses(m).map((c) => (
                            <Badge key={c} variant={c === 'residential' ? 'secondary' : c === 'land' ? 'success' : 'info'}>
                              {ASSET_CLASS_LABEL[c]}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {m.sources.map((s) => (
                            <Badge key={s} variant="outline">
                              {sourceLabel(s)}
                            </Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="capitalize">{m.cadence}</TableCell>
                      <TableCell>
                        <div className="text-xs text-muted-foreground">{when(m.lastRunAt, '')}</div>
                        <OutcomeBadges result={m.lastResult} />
                      </TableCell>
                      <TableCell>{when(m.nextRunAt, m.enabled ? 'not scheduled' : 'paused')}</TableCell>
                      <TableCell>
                        <Switch
                          checked={m.enabled}
                          onCheckedChange={(enabled) => toggleMutation.mutate({ id: m.id, enabled })}
                          aria-label={`Enable ${m.label}`}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex flex-wrap items-center justify-end gap-1">
                          <SmallBatchControl
                            label={m.label}
                            running={batchingId === m.id}
                            disabled={runningId === m.id}
                            onRun={(limit) => runMutation.mutate({ id: m.id, limit })}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            loading={runningId === m.id}
                            disabled={batchingId === m.id}
                            onClick={() => runMutation.mutate({ id: m.id })}
                          >
                            <Play size={14} className="mr-1" />
                            Run now
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            aria-label={`Remove ${m.label}`}
                            onClick={() => removeMutation.mutate(m.id)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {shown[m.id] && (
                      <TableRow>
                        <TableCell colSpan={7}>
                          <RunOutcome
                            result={shown[m.id]}
                            onDismiss={() =>
                              setShown((s) => {
                                const next = { ...s };
                                delete next[m.id];
                                return next;
                              })
                            }
                          />
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
            <p className="mt-3 text-xs text-muted-foreground">
              A small batch pulls up to the number you choose from each source, now, without changing the market&rsquo;s filters or schedule. Use it
              to check what a new market returns before turning it on.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Recent pulls</CardTitle>
        </CardHeader>
        <CardContent>
          {(runs.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing has run yet. Scheduled pulls happen overnight; use Run now to pull a market
              immediately.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Market</TableHead>
                  <TableHead>Trigger</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.data!.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>{when(r.createdAt, '')}</TableCell>
                    <TableCell>{marketLabel(r.entityId)}</TableCell>
                    <TableCell className="capitalize">{r.triggerType.toLowerCase()}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          r.status === 'COMPLETED'
                            ? 'success'
                            : r.status === 'FAILED'
                              ? 'destructive'
                              : 'info'
                        }
                      >
                        {r.status.toLowerCase()}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <OutcomeBadges result={r.outputJson} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              createMutation.mutate(form);
            }}
          >
            <DialogHeader>
              <DialogTitle>Add market</DialogTitle>
              <DialogDescription>
                What kind of property to look for, where, the sources to pull from, and how often. Each source uses its own default
                status unless you pick one.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-4">
              <div className="col-span-2">
                <AssetClassPicker value={form.assetClasses} onChange={setAssetClasses} />
              </div>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">City</span>
                <Input value={form.city} onChange={setField('city')} placeholder="Houston" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">ZIP (instead of city)</span>
                <Input value={form.postalCode} onChange={setField('postalCode')} placeholder="77008" />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">State (required)</span>
                <Input value={form.state} onChange={setField('state')} placeholder="TX" maxLength={2} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Label (optional)</span>
                <Input value={form.label} onChange={setField('label')} placeholder="Houston, TX" />
              </label>
              {nonResidential && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  Rural land often has no city or ZIP. For land and commercial you can name counties below instead.
                </p>
              )}
              {form.assetClasses.includes('residential') &&
                form.sources.includes('rentcast') &&
                !form.city.trim() &&
                !form.postalCode.trim() &&
                counties.length > 0 && (
                  <p className="col-span-2 text-xs text-amber-400">
                    RentCast cannot search by county, so without a city or ZIP its residential listings come from anywhere in the state.
                  </p>
                )}
              <div className="col-span-2 space-y-2 text-sm">
                <span className="text-muted-foreground">Sources</span>
                {LISTING_SOURCES.map((s) => (
                  <label key={s.value} className="flex items-start gap-2">
                    <Checkbox
                      checked={form.sources.includes(s.value)}
                      onCheckedChange={(v) =>
                        setForm((f) => ({ ...f, sources: toggleSource(f.sources, s.value, v === true) }))
                      }
                    />
                    <span>
                      <span className="font-medium">{s.label}</span>
                      <span className="block text-xs text-muted-foreground">{s.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
              {singleSource && (
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">
                    {singleSource.value === 'realie' ? 'Owner' : 'Status'}
                  </span>
                  <Select value={form.status} onChange={setField('status')}>
                    <option value="">Default ({singleSource.statuses[0]})</option>
                    {singleSource.statuses.map((st) => (
                      <option key={st} value={st}>
                        {st}
                      </option>
                    ))}
                  </Select>
                </label>
              )}
              {usesListings && (
                <>
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">Min days on market</span>
                    <Input
                      type="number"
                      min={0}
                      value={form.minDaysOnMarket}
                      onChange={setField('minDaysOnMarket')}
                      placeholder="90"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">Max list price</span>
                    <Input
                      type="number"
                      min={0}
                      value={form.maxPrice}
                      onChange={setField('maxPrice')}
                      placeholder="250000"
                    />
                  </label>
                </>
              )}
              {usesRealie && (
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Transferred within (days, Realie)</span>
                  <Input
                    type="number"
                    min={1}
                    value={form.transferredWithinDays}
                    onChange={setField('transferredWithinDays')}
                    placeholder="180"
                  />
                </label>
              )}
              {form.assetClasses.includes('land') && (
                <LandCriteriaFields value={form.land} onChange={(land) => setForm((f) => ({ ...f, land }))} />
              )}
              {form.assetClasses.includes('commercial') && (
                <CommercialCriteriaFields
                  value={form.commercial}
                  onChange={(commercial) => setForm((f) => ({ ...f, commercial }))}
                />
              )}
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Records per source per pull</span>
                <Input type="number" min={1} max={200} value={form.limit} onChange={setField('limit')} />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Cadence</span>
                <Select
                  value={form.cadence}
                  onChange={(e) => setForm((f) => ({ ...f, cadence: e.target.value, cadenceChosen: true }))}
                >
                  {CADENCES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </label>
              {nonResidential && (
                <p className="col-span-2 text-xs text-muted-foreground">
                  Land and commercial markets start on manual: run a small batch, check what came back, then choose a schedule.
                </p>
              )}
              <SourcingEstimatePanel
                request={{
                  state: form.state,
                  sources: form.sources,
                  assetClasses: form.assetClasses,
                  cadence: form.cadence,
                  limit: num(form.limit),
                }}
              />
              {problems.length > 0 && (
                <ul className="col-span-2 list-disc space-y-0.5 pl-5 text-xs text-destructive">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={createMutation.isPending}
                disabled={
                  !form.state.trim() ||
                  !hasArea ||
                  form.sources.length === 0 ||
                  form.assetClasses.length === 0 ||
                  problems.length > 0
                }
                title={!hasArea ? (nonResidential ? 'Enter a city, a ZIP or a county' : 'Enter a city or a ZIP') : undefined}
              >
                Add market
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={metrosOpen} onOpenChange={setMetrosOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              metrosMutation.mutate(metros);
            }}
          >
            <DialogHeader>
              <DialogTitle>Add top metros</DialogTitle>
              <DialogDescription>
                Adds the largest US cities as markets with each source&apos;s default filters.
                Cities already set up are skipped.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-4">
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">How many</span>
                <Select
                  value={metros.count}
                  onChange={(e) => setMetros((m) => ({ ...m, count: e.target.value }))}
                >
                  {METRO_COUNTS.map((n) => (
                    <option key={n} value={String(n)}>
                      Top {n}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Cadence</span>
                <Select
                  value={metros.cadence}
                  onChange={(e) => setMetros((m) => ({ ...m, cadence: e.target.value }))}
                >
                  {CADENCES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="col-span-2 space-y-2 text-sm">
                <span className="text-muted-foreground">Sources</span>
                {LISTING_SOURCES.map((s) => (
                  <label key={s.value} className="flex items-center gap-2">
                    <Checkbox
                      checked={metros.sources.includes(s.value)}
                      onCheckedChange={(v) =>
                        setMetros((m) => ({ ...m, sources: toggleSource(m.sources, s.value, v === true) }))
                      }
                    />
                    <span className="font-medium">{s.label}</span>
                  </label>
                ))}
              </div>
              <p className="col-span-2 text-xs text-muted-foreground">
                About {metroCalls} vendor calls per pull ({metros.count} metros x {metros.sources.length}{' '}
                source{metros.sources.length === 1 ? '' : 's'}); daily cadence means that many every
                night.
              </p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMetrosOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={metrosMutation.isPending} disabled={metros.sources.length === 0}>
                Add {metros.count} metros
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

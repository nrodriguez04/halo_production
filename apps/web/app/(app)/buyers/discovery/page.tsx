'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Database, RefreshCw, Upload, UserPlus } from 'lucide-react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { PageHeader } from '@/components/page-header';
import { EmptyState, ErrorState, LoadingState } from '@/components/states';
import { toast } from '@/components/ui/toast';
import { Field } from '@/components/disposition/agreement-panel';
import { DocumentSelect } from '@/components/disposition/document-select';
import { day, errorText, money } from '@/lib/disposition';

interface Candidate {
  id: string;
  name: string;
  kind: string;
  purchaseCount: number;
  cashPurchases: number;
  financedPurchases: number;
  resales: number;
  medianHoldDays: number | null;
  lastPurchase: string;
  states: string[];
  buyBox: { cities: string[]; zips: string[]; priceMin: number | null; priceMax: number | null; propertyTypes: string[] };
  score: number;
  reasons: string[];
  status: 'candidate' | 'promoted' | 'dismissed';
  buyerId: string | null;
}

interface Sources {
  providers: string[];
  regridConfigured: boolean;
  externalDataEnabled: boolean;
  statesWithAccess: number;
  recordedSales: {
    total: number;
    byState: Array<{ state: string; source: string; sales: number; latest: string | null }>;
    imports: Array<{ id: string; source: string; state: string | null; rows: number; imported: number; skipped: number; createdAt: string }>;
  };
}

const FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
  { key: 'sourceRef', label: 'Record reference (instrument or document number)', required: true },
  { key: 'saleDate', label: 'Sale or recording date', required: true },
  { key: 'price', label: 'Price / consideration' },
  { key: 'buyerName', label: 'Buyer (grantee)' },
  { key: 'sellerName', label: 'Seller (grantor)' },
  { key: 'buyerMailingZip', label: "Buyer's mailing zip" },
  { key: 'address', label: 'Property address' },
  { key: 'city', label: 'City' },
  { key: 'zip', label: 'Zip' },
  { key: 'apn', label: 'Parcel number' },
  { key: 'mortgageAmount', label: 'Mortgage amount (blank means cash)' },
  { key: 'deedType', label: 'Deed type' },
  { key: 'propertyType', label: 'Property type' },
];

function useCall<I>(fn: (i: I) => Promise<unknown>, ok: (out: any) => string, fail: string, done?: () => void) {
  const qc = useQueryClient();
  return useApiMutation<I, any>(fn, {
    onSuccess: (out) => {
      toast.success(ok(out));
      qc.invalidateQueries({ queryKey: ['/buyer-candidates'] });
      qc.invalidateQueries({ queryKey: ['/data/sources'] });
      done?.();
    },
    onError: (err) => toast.error(fail, { description: errorText(err) }),
  });
}

/**
 * Buyer discovery (docs/data-pipeline.md s4): likely cash buyers found in
 * recorded sales. A candidate shows what the records prove (purchases)
 * and what Halo infers (a buy box); promoting one makes a buyer with no
 * contact and no consent, which a person adds before any outreach.
 */
export default function BuyerDiscoveryPage() {
  const [status, setStatus] = useState<'candidate' | 'promoted' | 'dismissed'>('candidate');
  const [state, setState] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [doc, setDoc] = useState('');
  const [preview, setPreview] = useState<{ headers: string[]; sample: Array<Record<string, string>>; guess: Record<string, string> } | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [importState, setImportState] = useState('');
  const [county, setCounty] = useState('');
  const [countyFips, setCountyFips] = useState('');
  const [dismissFor, setDismissFor] = useState<Candidate | null>(null);
  const [reason, setReason] = useState('');

  const sources = useApiQuery<Sources>('/data/sources');
  const candidates = useApiQuery<Candidate[]>('/buyer-candidates', {
    params: { status, limit: 100, ...(state.trim().length === 2 ? { state: state.trim().toUpperCase() } : {}) },
  });

  const loadPreview = useApiMutation<void, NonNullable<typeof preview>>(
    () => apiJson('/data/recorded-sales/preview', { method: 'POST', body: JSON.stringify({ documentId: doc }) }),
    {
      onSuccess: (out) => {
        setPreview(out);
        setMapping(out.guess);
      },
      onError: (err) => toast.error('Could not read the file', { description: errorText(err) }),
    },
  );
  const runImport = useCall<void>(
    () =>
      apiJson('/data/recorded-sales/import', {
        method: 'POST',
        body: JSON.stringify({
          documentId: doc,
          state: importState,
          county: county.trim() || null,
          countyFips: countyFips.trim() || null,
          mapping: Object.fromEntries(Object.entries(mapping).filter(([, v]) => v)),
        }),
      }),
    (out) => `Imported ${out.imported} sale(s); ${out.duplicates} already on file, ${out.skipped} skipped`,
    'Could not import',
    () => setImportOpen(false),
  );
  const refresh = useCall<void>(
    () => apiJson('/buyer-candidates/refresh', { method: 'POST', body: JSON.stringify(state.trim().length === 2 ? { state: state.trim().toUpperCase() } : {}) }),
    (out) => `${out.candidates} candidate(s) from ${out.sales} sale(s); ${out.linkedToExistingBuyers} already buyers`,
    'Could not refresh',
  );
  const promote = useCall<string>(
    (id) => apiJson(`/buyer-candidates/${id}/promote`, { method: 'POST' }),
    () => 'Added as a buyer. Record contact and consent on their profile before any outreach.',
    'Could not promote',
  );
  const dismiss = useCall<void>(
    () => apiJson(`/buyer-candidates/${dismissFor?.id}/dismiss`, { method: 'POST', body: JSON.stringify({ reason }) }),
    () => 'Dismissed',
    'Could not dismiss',
    () => setDismissFor(null),
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        eyebrow={
          <Link href="/buyers" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft size={12} aria-hidden /> Buyers
          </Link>
        }
        title="Buyer discovery"
        description="Likely cash buyers from recorded sales. Records show what they bought; the buy box is inferred; neither is a current offer or proof of funds."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { setImportOpen(true); setPreview(null); setDoc(''); }}>
              <Upload size={14} className="mr-1" aria-hidden />
              Import county sales
            </Button>
            <Button size="sm" loading={refresh.isPending} onClick={() => refresh.mutate()}>
              <RefreshCw size={14} className="mr-1" aria-hidden />
              Find candidates
            </Button>
          </div>
        }
      />

      {sources.data && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Database size={16} className="text-primary" aria-hidden />
              <CardTitle>Data on file</CardTitle>
            </div>
            <CardDescription>
              {sources.data.recordedSales.total} recorded sale(s).{' '}
              {sources.data.providers.length ? `Providers configured: ${sources.data.providers.join(', ')}.` : 'No property-data provider key is configured.'}{' '}
              {sources.data.regridConfigured ? 'Regrid parcels available.' : ''}
              {!sources.data.externalDataEnabled && ' External data calls are switched off on the Control Plane.'}
            </CardDescription>
          </CardHeader>
          {sources.data.recordedSales.byState.length > 0 && (
            <CardContent className="flex flex-wrap gap-2">
              {sources.data.recordedSales.byState.map((s) => (
                <Badge key={`${s.state}-${s.source}`} variant="outline">
                  {s.state} · {s.source} · {s.sales} (latest {day(s.latest)})
                </Badge>
              ))}
            </CardContent>
          )}
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select className="w-40" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Status">
              <option value="candidate">Candidates</option>
              <option value="promoted">Promoted</option>
              <option value="dismissed">Dismissed</option>
            </Select>
            <Input className="w-24 uppercase" maxLength={2} placeholder="State" value={state} onChange={(e) => setState(e.target.value)} aria-label="State" />
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto p-0">
          {candidates.isPending ? (
            <LoadingState />
          ) : candidates.isError ? (
            <ErrorState title="Could not load" description={errorText(candidates.error)} onRetry={() => candidates.refetch()} />
          ) : candidates.data.length === 0 ? (
            <EmptyState icon={UserPlus} title="No candidates" description="Import recorded sales, then find candidates." />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Buyer</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Recorded purchases</TableHead>
                  <TableHead>Inferred buy box</TableHead>
                  <TableHead>Why</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {candidates.data.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-caption text-muted-foreground">{c.kind}</p>
                    </TableCell>
                    <TableCell className="font-mono">{c.score}</TableCell>
                    <TableCell className="text-caption">
                      {c.purchaseCount} bought, {c.cashPurchases} without a mortgage, {c.resales} resold
                      <div className="text-muted-foreground">last {day(c.lastPurchase)}</div>
                    </TableCell>
                    <TableCell className="text-caption">
                      {[...c.buyBox.cities, ...c.buyBox.zips].slice(0, 5).join(', ')}
                      <div className="text-muted-foreground">
                        {money(c.buyBox.priceMin)} to {money(c.buyBox.priceMax)}
                      </div>
                    </TableCell>
                    <TableCell className="text-caption text-muted-foreground">{c.reasons.join('; ')}</TableCell>
                    <TableCell>
                      {c.status === 'candidate' ? (
                        <div className="flex gap-2">
                          <Button size="sm" loading={promote.isPending} onClick={() => promote.mutate(c.id)}>
                            Add as buyer
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setDismissFor(c); setReason(''); }}>
                            Dismiss
                          </Button>
                        </div>
                      ) : c.buyerId ? (
                        <Link href={`/buyers/${c.buyerId}`} className="text-caption text-primary underline-offset-2 hover:underline">
                          Open buyer
                        </Link>
                      ) : null}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Import a county recorded-sales export</DialogTitle>
            <DialogDescription>Only data you are authorized to use. Upload the .csv to the documents library first, then map its columns.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-64 flex-1">
                <Field label="File" htmlFor="imp-doc">
                  <DocumentSelect id="imp-doc" value={doc} onChange={setDoc} placeholder="The county .csv…" />
                </Field>
              </div>
              <Button size="sm" variant="outline" disabled={!doc} loading={loadPreview.isPending} onClick={() => loadPreview.mutate()}>
                Read columns
              </Button>
            </div>
            {preview && (
              <>
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="State" htmlFor="imp-state">
                    <Input id="imp-state" maxLength={2} className="uppercase" value={importState} onChange={(e) => setImportState(e.target.value.toUpperCase())} />
                  </Field>
                  <Field label="County" htmlFor="imp-county">
                    <Input id="imp-county" value={county} onChange={(e) => setCounty(e.target.value)} />
                  </Field>
                  <Field label="County FIPS (5 digits)" htmlFor="imp-fips">
                    <Input id="imp-fips" maxLength={5} value={countyFips} onChange={(e) => setCountyFips(e.target.value)} />
                  </Field>
                </div>
                <div className="grid max-h-80 gap-2 overflow-y-auto md:grid-cols-2">
                  {FIELDS.map((f) => (
                    <Field key={f.key} label={`${f.label}${f.required ? ' *' : ''}`} htmlFor={`map-${f.key}`}>
                      <Select id={`map-${f.key}`} value={mapping[f.key] ?? ''} onChange={(e) => setMapping({ ...mapping, [f.key]: e.target.value })}>
                        <option value="">(not in this file)</option>
                        {preview.headers.map((h) => (
                          <option key={h} value={h}>
                            {h}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  ))}
                </div>
                <p className="text-caption text-muted-foreground">{preview.sample.length} sample row(s) read.</p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!preview || importState.length !== 2 || !mapping.sourceRef || !mapping.saleDate}
              loading={runImport.isPending}
              onClick={() => runImport.mutate()}
            >
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!dismissFor} onOpenChange={(o) => !o && setDismissFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss {dismissFor?.name}</DialogTitle>
            <DialogDescription>They stay on file and are not offered again.</DialogDescription>
          </DialogHeader>
          <Field label="Why" htmlFor="dis-reason">
            <Input id="dis-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDismissFor(null)}>
              Cancel
            </Button>
            <Button disabled={reason.trim().length < 3} loading={dismiss.isPending} onClick={() => dismiss.mutate()}>
              Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

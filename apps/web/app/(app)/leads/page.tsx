'use client';

import { useState, type ChangeEvent } from 'react';
import { useApiQuery, useApiMutation, useQueryClient, apiJson } from '@/lib/api-query';
import { LISTING_SOURCES, sourceDef } from '@/lib/listing-sources';
import { useDebouncedValue } from '@/lib/use-debounce';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from '@/components/ui/toast';
import { PageHeader } from '@/components/page-header';
import { SearchFilterBar } from '@/components/search-filter-bar';
import { LoadingState, EmptyState, ErrorState, SkeletonTable } from '@/components/states';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Upload, Plus, Loader2, Check, X, Users, Building2 } from 'lucide-react';

interface Lead {
  id: string;
  status: string;
  canonicalAddress?: string;
  canonicalCity?: string;
  canonicalState?: string;
  canonicalZip?: string;
  score?: number;
  tags: string[];
  createdAt: string;
}

interface ListingImportResult {
  source: string;
  feed: string;
  searched: number;
  total: number | null;
  created: number;
  duplicates: number;
  errors: string[];
}


const emptyImportForm = {
  source: 'mls',
  city: '',
  state: '',
  postalCode: '',
  status: 'Active',
  minDaysOnMarket: '',
  maxPrice: '',
  transferredWithinDays: '',
  limit: '50',
};
type ImportForm = typeof emptyImportForm;

const statusVariant = (status: string) => {
  switch (status) {
    case 'new':
      return 'info' as const;
    case 'enriching':
      return 'info' as const;
    case 'enriched':
      return 'success' as const;
    case 'contacted':
      return 'warning' as const;
    case 'qualified':
      return 'success' as const;
    case 'disqualified':
      return 'destructive' as const;
    default:
      return 'secondary' as const;
  }
};

// The lifecycle controller validates legal transitions, but we hide
// buttons for terminal statuses so the UI never renders a click target
// that the api will just reject.
const canQualify = (status: string) => status === 'enriched' || status === 'contacted';
const canDisqualify = (status: string) => status !== 'disqualified';

export default function LeadsPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebouncedValue(search, 250);
  const queryClient = useQueryClient();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importForm, setImportForm] = useState<ImportForm>(emptyImportForm);
  const setImportField =
    (field: keyof ImportForm) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setImportForm((form) => ({ ...form, [field]: e.target.value }));
  const setImportSource = (e: ChangeEvent<HTMLSelectElement>) => {
    const next = sourceDef(e.target.value);
    setImportForm((form) => ({ ...form, source: next.value, status: next.statuses[0] }));
  };

  const {
    data: leads = [],
    isPending,
    isError,
    error,
    refetch,
  } = useApiQuery<Lead[]>('/leads', {
    params: { search: debouncedSearch || undefined, take: 200 },
    placeholderData: (prev) => prev,
  });

  const transitionMutation = useApiMutation<
    { leadId: string; next: 'qualified' | 'disqualified'; reason?: string },
    unknown
  >(
    ({ leadId, next, reason }) =>
      apiJson(`/lead-lifecycle/${leadId}/transition`, {
        method: 'POST',
        body: JSON.stringify({ next, reason }),
      }),
    {
      onMutate: ({ leadId }) => {
        setPendingId(leadId);
      },
      onSuccess: (_data, variables) => {
        toast.success(
          variables.next === 'qualified' ? 'Lead qualified' : 'Lead disqualified',
        );
      },
      onError: (err: any) => {
        toast.error('Transition failed', { description: err?.message });
      },
      onSettled: () => {
        setPendingId(null);
        queryClient.invalidateQueries({ queryKey: ['/leads'] });
      },
    },
  );

  const listingImportMutation = useApiMutation<ImportForm, ListingImportResult>(
    (form) => {
      const num = (v: string) => (v.trim() === '' ? undefined : Number(v));
      // JSON.stringify drops undefined fields, which the strict API schema wants.
      return apiJson<ListingImportResult>('/leads/import/listings', {
        method: 'POST',
        body: JSON.stringify({
          source: form.source,
          city: form.city.trim() || undefined,
          state: form.state.trim().toUpperCase() || undefined,
          postalCode: form.postalCode.trim() || undefined,
          status: [form.status],
          minDaysOnMarket: num(form.minDaysOnMarket),
          transferredWithinDays: num(form.transferredWithinDays),
          maxPrice: num(form.maxPrice),
          limit: num(form.limit) ?? 50,
        }),
      });
    },
    {
      onSuccess: (result) => {
        const label = sourceDef(result.source).label;
        toast.success(
          result.created === 1
            ? `1 new lead from ${label}`
            : `${result.created} new leads from ${label}`,
          {
            description:
              `${result.searched} listings searched · ${result.duplicates} already in your pipeline` +
              (result.errors.length ? ` · ${result.errors.length} rows rejected` : ''),
          },
        );
        setImportOpen(false);
        queryClient.invalidateQueries({ queryKey: ['/leads'] });
      },
      onError: (err) => {
        toast.error('Listing import failed', { description: err.message });
      },
    },
  );

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Leads"
        description="Source records, enrichment status, and qualification controls."
        actions={
          <>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Building2 size={16} className="mr-2" />
              Import listings
            </Button>
            <Button variant="outline" size="sm">
              <Upload size={16} className="mr-2" />
              Import CSV
            </Button>
            <Button size="sm">
              <Plus size={16} className="mr-2" />
              New Lead
            </Button>
          </>
        }
      />

      <SearchFilterBar
        value={search}
        onChange={setSearch}
        placeholder="Search address, city, or owner…"
      />

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              listingImportMutation.mutate(importForm);
            }}
          >
            <DialogHeader>
              <DialogTitle>Import listings</DialogTitle>
              <DialogDescription>
                Pulls listings into leads. Addresses already in your pipeline are skipped, so
                re-running a search is safe. {sourceDef(importForm.source).hint}
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-3 py-4">
              <label className="col-span-2 space-y-1 text-sm">
                <span className="text-muted-foreground">Source</span>
                <Select value={importForm.source} onChange={setImportSource}>
                  {LISTING_SOURCES.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="col-span-2 space-y-1 text-sm">
                <span className="text-muted-foreground">City</span>
                <Input
                  value={importForm.city}
                  onChange={setImportField('city')}
                  placeholder="Houston"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">State</span>
                <Input
                  value={importForm.state}
                  onChange={setImportField('state')}
                  placeholder={importForm.source === 'realie' ? 'TX (required)' : 'TX'}
                  maxLength={2}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">ZIP (instead of city)</span>
                <Input
                  value={importForm.postalCode}
                  onChange={setImportField('postalCode')}
                  placeholder="77008"
                />
              </label>
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">
                  {importForm.source === 'realie' ? 'Owner' : 'Status'}
                </span>
                <Select value={importForm.status} onChange={setImportField('status')}>
                  {sourceDef(importForm.source).statuses.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </label>
              {importForm.source === 'realie' ? (
                <label className="space-y-1 text-sm">
                  <span className="text-muted-foreground">Transferred within (days)</span>
                  <Input
                    type="number"
                    min={1}
                    value={importForm.transferredWithinDays}
                    onChange={setImportField('transferredWithinDays')}
                    placeholder="180"
                  />
                </label>
              ) : (
                <>
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">Min days on market</span>
                    <Input
                      type="number"
                      min={0}
                      value={importForm.minDaysOnMarket}
                      onChange={setImportField('minDaysOnMarket')}
                      placeholder="90"
                    />
                  </label>
                  <label className="space-y-1 text-sm">
                    <span className="text-muted-foreground">Max list price</span>
                    <Input
                      type="number"
                      min={0}
                      value={importForm.maxPrice}
                      onChange={setImportField('maxPrice')}
                      placeholder="250000"
                    />
                  </label>
                </>
              )}
              <label className="space-y-1 text-sm">
                <span className="text-muted-foreground">Listings to pull (1 to 200)</span>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={importForm.limit}
                  onChange={setImportField('limit')}
                />
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setImportOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                loading={listingImportMutation.isPending}
                disabled={
                  (!importForm.city.trim() && !importForm.postalCode.trim()) ||
                  (importForm.source === 'realie' && !importForm.state.trim())
                }
              >
                Import listings
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {isPending ? (
        <LoadingState skeleton>
          <SkeletonTable rows={6} cols={5} />
        </LoadingState>
      ) : isError ? (
        <ErrorState
          title="Couldn't load leads"
          description={error?.message ?? 'The server returned an error.'}
          onRetry={() => refetch()}
        />
      ) : leads.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No leads yet"
          description={
            debouncedSearch
              ? 'No leads match that search. Try clearing it or import a CSV.'
              : 'Import a CSV or add a lead manually to get started.'
          }
          action={
            <div className="flex gap-2">
              <Button variant="outline" size="sm">
                <Upload size={16} className="mr-2" />
                Import CSV
              </Button>
              <Button size="sm">
                <Plus size={16} className="mr-2" />
                New Lead
              </Button>
            </div>
          }
        />
      ) : (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>{leads.length} leads</CardTitle>
            <Badge variant="secondary" className="font-mono">
              {debouncedSearch ? `Filtered: "${debouncedSearch}"` : 'All'}
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {leads.map((lead) => {
                  const busy = pendingId === lead.id;
                  return (
                    <TableRow key={lead.id}>
                      <TableCell>
                        <div className="font-medium text-foreground">
                          {lead.canonicalAddress || 'N/A'}
                        </div>
                        <div className="text-caption text-muted-foreground">
                          {[lead.canonicalCity, lead.canonicalState, lead.canonicalZip]
                            .filter(Boolean)
                            .join(', ')}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(lead.status)}>{lead.status}</Badge>
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {lead.score ? lead.score.toFixed(2) : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(lead.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-2">
                          {canQualify(lead.status) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={busy}
                                  onClick={() =>
                                    transitionMutation.mutate({ leadId: lead.id, next: 'qualified' })
                                  }
                                  aria-label={`Qualify lead ${lead.canonicalAddress ?? lead.id}`}
                                >
                                  {busy ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <Check size={14} />
                                  )}
                                  <span className="ml-1">Qualify</span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Mark this lead as qualified</TooltipContent>
                            </Tooltip>
                          )}
                          {canDisqualify(lead.status) && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={busy}
                                  onClick={() =>
                                    transitionMutation.mutate({
                                      leadId: lead.id,
                                      next: 'disqualified',
                                      reason: 'manual',
                                    })
                                  }
                                  aria-label={`Disqualify lead ${lead.canonicalAddress ?? lead.id}`}
                                >
                                  {busy ? (
                                    <Loader2 size={14} className="animate-spin" />
                                  ) : (
                                    <X size={14} />
                                  )}
                                  <span className="ml-1">Disqualify</span>
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Reject this lead</TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

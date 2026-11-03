'use client';

import { useQuery } from '@tanstack/react-query';
import { apiJson, type ApiError } from '@/lib/api-query';
import { useDebouncedValue } from '@/lib/use-debounce';
import { sourceLabel } from '@/lib/listing-sources';
import { errorText } from '@/lib/disposition';
import { ASSET_CLASS_LABEL, type AssetClass } from '@/lib/assets';
import { SUPPORT_LABEL, SUPPORT_VARIANT, dollars, type SourcingEstimate } from '@/lib/sourcing';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2 } from 'lucide-react';

export interface EstimateRequest {
  state: string;
  sources: string[];
  assetClasses: AssetClass[];
  cadence: string;
  limit?: number;
}

/**
 * What a market would cost to pull and what its sources can filter, before
 * anything is saved or pulled (POST /sourcing/estimate, which calls no
 * provider). Re-asked as the form changes, after a pause in typing.
 */
export function SourcingEstimatePanel({ request }: { request: EstimateRequest }) {
  // Debounced as text, so a parent re-render with the same values does not restart the wait.
  const debounced = JSON.parse(useDebouncedValue(JSON.stringify(request), 400)) as EstimateRequest;
  const ready = /^[A-Za-z]{2}$/.test(debounced.state.trim()) && debounced.sources.length > 0 && debounced.assetClasses.length > 0;
  const body = {
    state: debounced.state.trim().toUpperCase(),
    sources: debounced.sources,
    assetClasses: debounced.assetClasses,
    cadence: debounced.cadence,
    ...(debounced.limit && debounced.limit >= 1 && debounced.limit <= 200 ? { limit: Math.round(debounced.limit) } : {}),
  };
  const estimate = useQuery<SourcingEstimate, ApiError>({
    queryKey: ['/sourcing/estimate', body],
    queryFn: () => apiJson<SourcingEstimate>('/sourcing/estimate', { method: 'POST', body: JSON.stringify(body) }),
    enabled: ready,
    placeholderData: (prev) => prev,
    staleTime: 60_000,
    retry: false,
  });

  if (!ready) {
    return (
      <div className="col-span-2 rounded-md border border-dashed border-border p-4 text-xs text-muted-foreground">
        Enter a state and choose a source to see what a pull would cost and what the sources can filter.
      </div>
    );
  }
  if (estimate.isError) {
    return (
      <div className="col-span-2 rounded-md border border-destructive/40 p-4 text-xs text-destructive">
        Could not estimate this market: {errorText(estimate.error)}
      </div>
    );
  }
  const e = estimate.data;
  if (!e) {
    return (
      <div className="col-span-2 flex items-center gap-2 rounded-md border border-border p-4 text-xs text-muted-foreground">
        <Loader2 size={14} className="animate-spin" aria-hidden /> Estimating…
      </div>
    );
  }
  const columns = Object.keys(e.coverage[0]?.support ?? {});
  const unavailable = e.coverage.filter((row) => columns.length > 0 && columns.every((s) => row.support[s] === 'none'));
  const nonResidential = debounced.assetClasses.some((c) => c !== 'residential');

  return (
    <div className="col-span-2 space-y-4 rounded-md border border-border p-4 text-sm" aria-busy={estimate.isFetching || undefined}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-medium">Estimated provider cost</h4>
          {estimate.isFetching && <Loader2 size={14} className="animate-spin text-muted-foreground" aria-label="Updating" />}
        </div>
        <p>
          Up to <span className="font-mono font-semibold">{dollars(e.maxUsdPerRun)}</span> per pull
          {e.runsPerMonth > 0 ? (
            <>
              , or up to <span className="font-mono font-semibold">{dollars(e.maxUsdPerMonth)}</span> a month on a {debounced.cadence} schedule.
            </>
          ) : (
            '. Manual: nothing is pulled until you run it.'
          )}
        </p>
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {e.perSource.map((p) => (
            <li key={p.source}>
              <span className="font-medium text-foreground">{sourceLabel(p.source)}</span>: up to {p.maxCallsPerRun} call
              {p.maxCallsPerRun === 1 ? '' : 's'}, up to {dollars(p.maxUsdPerRun)}. {p.note}
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          The most a pull can bill at your rate card, not a quote.
          {nonResidential &&
            ' Most land and commercial filters are applied by Halo after the records arrive, so a pull reads full pages and you pay for records that are then set aside.'}
        </p>
      </div>

      {e.status.length > 0 && (
        <div className="space-y-1">
          <h4 className="font-medium">What Halo may do in {body.state}</h4>
          <ul className="space-y-1.5">
            {e.status.map((s) => (
              <li key={s.assetClass} className="flex flex-wrap items-start gap-2 text-xs">
                <Badge variant={s.researchOnly ? 'warning' : 'success'}>
                  {ASSET_CLASS_LABEL[s.assetClass]}: {s.researchOnly ? 'research only' : 'seller contact allowed'}
                </Badge>
                <span className="min-w-0 flex-1 text-muted-foreground">{s.summary}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-2">
        <h4 className="font-medium">What the sources can filter</h4>
        {columns.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Your MLS feed is not described here; what it can filter depends on the feed. Add RentCast or Realie to see their coverage.
          </p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Filter</TableHead>
                  {columns.map((s) => (
                    <TableHead key={s}>{sourceLabel(s)}</TableHead>
                  ))}
                  <TableHead>Note</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {e.coverage.map((row) => (
                  <TableRow key={row.filter}>
                    <TableCell className="font-medium">{row.label}</TableCell>
                    {columns.map((s) => {
                      const support = row.support[s] ?? 'none';
                      return (
                        <TableCell key={s}>
                          <Badge variant={SUPPORT_VARIANT[support]}>{SUPPORT_LABEL[support]}</Badge>
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-xs text-muted-foreground">{row.note ?? ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Provider filters</span>: the source narrows the search before it charges.{' '}
              <span className="font-medium text-foreground">Halo filters after the pull</span>: the records are paid for, then Halo sets aside the ones
              that do not fit. <span className="font-medium text-foreground">Not returned</span>: the source does not have the field, so a filter on it
              sets every record from that source aside.
            </p>
            {unavailable.length > 0 && (
              <p className="text-xs text-amber-400">
                No source chosen here returns: {unavailable.map((r) => r.label.toLowerCase()).join('; ')}.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useApiQuery } from '@/lib/api-query';
import { useDebouncedValue } from '@/lib/use-debounce';
import { acresText, propertyLabel, type AssetFilter } from '@/lib/assets';
import { AssetClassBadge, AssetClassFilter } from '@/components/assets/asset-class-badge';
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
import { Select } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { PageHeader } from '@/components/page-header';
import { SearchFilterBar } from '@/components/search-filter-bar';
import { LoadingState, EmptyState, ErrorState, SkeletonTable } from '@/components/states';
import { RefreshCw, Map as MapIcon } from 'lucide-react';

const PropertyMap = dynamic(() => import('@/components/property-map'), { ssr: false });

interface Property {
  id: string;
  /** A rural parcel may have no street address or city: its APN and county name it. */
  address: string | null;
  city: string | null;
  state: string;
  zip?: string | null;
  apn?: string | null;
  county?: string | null;
  acres?: number | null;
  assetClass?: string | null;
  assetSubtype?: string | null;
  estimatedValue?: number;
  salePrice?: number | null;
  confidence?: number;
  deals?: Array<{ id: string; stage: string }>;
}

function formatUsd(n: number) {
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function valueSpread(estimated?: number | null, sale?: number | null): number | null {
  if (estimated == null || sale == null || Number.isNaN(estimated) || Number.isNaN(sale)) {
    return null;
  }
  return estimated - sale;
}

export default function PropertiesPage() {
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [assetClass, setAssetClass] = useState<AssetFilter>('');
  const debouncedCity = useDebouncedValue(search, 250);

  const {
    data: properties = [],
    isPending,
    isError,
    error,
    refetch,
  } = useApiQuery<Property[]>('/properties/search', {
    params: {
      city: debouncedCity || undefined,
      state: stateFilter || undefined,
      assetClass: assetClass || undefined,
    },
    placeholderData: (prev) => prev,
  });

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Properties"
        description="Geocoded inventory with confidence scores, value estimates, and active deals."
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw size={16} className="mr-2" /> Refresh
          </Button>
        }
      />

      <PropertyMap />

      <SearchFilterBar
        value={search}
        onChange={setSearch}
        placeholder="Filter by city…"
        filters={
          <>
            <AssetClassFilter value={assetClass} onChange={setAssetClass} />
            <Select
              value={stateFilter}
              onChange={(e) => setStateFilter(e.target.value)}
              className="w-32"
              aria-label="Filter by state"
            >
              <option value="">All States</option>
              {['TX', 'CA', 'FL', 'GA', 'AZ', 'NC', 'TN', 'OH', 'IN', 'MO', 'CO', 'NV'].map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </>
        }
      />

      {isPending ? (
        <LoadingState skeleton>
          <SkeletonTable rows={6} cols={6} />
        </LoadingState>
      ) : isError ? (
        <ErrorState
          title="Couldn't load properties"
          description={error?.message ?? 'The properties service did not respond.'}
          onRetry={() => refetch()}
        />
      ) : properties.length === 0 ? (
        <EmptyState
          icon={MapIcon}
          title="No properties match"
          description={
            debouncedCity || stateFilter || assetClass
              ? 'Try widening your filters.'
              : 'Properties appear here once leads are enriched and geocoded.'
          }
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{properties.length} properties</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Address</TableHead>
                  <TableHead>City/State</TableHead>
                  <TableHead>Asset class</TableHead>
                  <TableHead className="text-right">Estimated Value</TableHead>
                  <TableHead className="text-right">Sale Price</TableHead>
                  <TableHead className="text-right">
                    <span className="block">Value Spread</span>
                    <span className="block text-[10px] font-normal normal-case text-muted-foreground">
                      est. − sale
                    </span>
                  </TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Deals</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {properties.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium text-foreground">
                      {p.address?.trim() ? p.address : propertyLabel(p)}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {[p.city ?? (p.county ? `${p.county} County` : null), p.state].filter(Boolean).join(', ')}
                    </TableCell>
                    <TableCell>
                      <AssetClassBadge assetClass={p.assetClass} subtype={p.assetSubtype} />
                      {p.assetClass === 'land' && acresText(p.acres) && (
                        <div className="text-caption text-muted-foreground">{acresText(p.acres)}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-mono text-foreground">
                      {p.estimatedValue != null ? formatUsd(p.estimatedValue) : '—'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-foreground">
                      {p.salePrice != null ? formatUsd(p.salePrice) : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      {(() => {
                        const spread = valueSpread(p.estimatedValue, p.salePrice);
                        if (spread == null) return <span className="text-muted-foreground">—</span>;
                        const positive = spread >= 0;
                        return (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span
                                className={
                                  positive
                                    ? 'font-mono font-medium text-emerald-400'
                                    : 'font-mono font-medium text-amber-400'
                                }
                              >
                                {positive ? '+' : ''}
                                {formatUsd(spread)}
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>Estimated value minus sale price</TooltipContent>
                          </Tooltip>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      {p.confidence != null ? (
                        <Badge
                          variant={
                            p.confidence > 0.7
                              ? 'success'
                              : p.confidence > 0.4
                                ? 'warning'
                                : 'destructive'
                          }
                        >
                          {(p.confidence * 100).toFixed(0)}%
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {(p.deals?.length || 0) > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {p.deals!.map((d) => (
                            <Badge key={d.id} variant="info">
                              {d.stage}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

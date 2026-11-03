'use client';

import { useState } from 'react';
import { FlaskConical, X } from 'lucide-react';
import { sourceLabel } from '@/lib/listing-sources';
import { ASSET_CLASS_LABEL, isAssetClass } from '@/lib/assets';
import { MAX_BATCH, totals, type MarketResult } from '@/lib/sourcing';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/**
 * What one pull did, in words: new leads, duplicates, what the market's
 * filters set aside and why, what was kept but needs its asset class
 * confirmed, and the count per class. A source that failed says why.
 */
export function RunOutcome({ result, onDismiss }: { result: MarketResult; onDismiss?: () => void }) {
  const t = totals(result);
  const classes = Object.entries(t.byClass).filter(([c, n]) => isAssetClass(c) && (n ?? 0) > 0);
  return (
    <div className="space-y-2 rounded-md border border-border bg-secondary/30 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-medium">
          {result.batchLimit ? `Small batch (up to ${plural(result.batchLimit, 'record')} per source)` : 'Pull'} at{' '}
          {new Date(result.ranAt).toLocaleString()}
        </p>
        {onDismiss && (
          <Button variant="ghost" size="icon-sm" aria-label="Hide this result" onClick={onDismiss}>
            <X size={14} />
          </Button>
        )}
      </div>
      {result.skipped ? (
        <p className="text-amber-400">Nothing was pulled: {result.skipped}.</p>
      ) : (
        <>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            <li>
              <span className="font-semibold">{plural(t.created, 'new lead')}</span>
            </li>
            <li className="text-muted-foreground">{plural(t.searched, 'record')} read</li>
            <li className="text-muted-foreground">{plural(t.duplicates, 'duplicate')} already in your pipeline</li>
            {t.reported && <li className="text-muted-foreground">{t.filtered.toLocaleString('en-US')} set aside by your filters</li>}
            {t.unclassified > 0 && (
              <li className="text-amber-400">{plural(t.unclassified, 'lead')} kept, but the asset class needs a person to confirm it</li>
            )}
          </ul>
          {classes.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 text-xs">
              <span className="text-muted-foreground">Kept by class:</span>
              {classes.map(([c, n]) => (
                <Badge key={c} variant="outline">
                  {ASSET_CLASS_LABEL[c as keyof typeof ASSET_CLASS_LABEL]}: {n}
                </Badge>
              ))}
            </div>
          )}
          {t.reasons.length > 0 && (
            <div className="text-xs">
              <p className="text-muted-foreground">Why records were set aside:</p>
              <ul className="mt-0.5 list-disc space-y-0.5 pl-5">
                {t.reasons.map(([reason, n]) => (
                  <li key={reason}>
                    {reason}: {n.toLocaleString('en-US')}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
      {(result.outcomes ?? []).length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {result.outcomes.map((o) => (
            <li key={o.source}>
              <span className="font-medium text-foreground">{sourceLabel(o.source)}</span>:{' '}
              {o.ok ? (
                <>
                  {o.searched ?? 0} read, {o.created ?? 0} new, {o.duplicates ?? 0} duplicate{o.duplicates === 1 ? '' : 's'}
                  {o.filtered != null ? `, ${o.filtered} set aside` : ''}
                </>
              ) : (
                <span className="text-destructive">failed: {o.error}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Pull a few records now to see what a market returns before it runs on a
 * schedule. The batch limit applies per source and never changes the
 * market's own filters.
 */
export function SmallBatchControl({
  label,
  running,
  disabled,
  onRun,
}: {
  label: string;
  running: boolean;
  disabled?: boolean;
  onRun: (limit: number) => void;
}) {
  const [size, setSize] = useState('10');
  const n = Number(size);
  const valid = Number.isInteger(n) && n >= 1 && n <= MAX_BATCH;
  return (
    <div className="inline-flex items-center gap-1">
      <Input
        type="number"
        min={1}
        max={MAX_BATCH}
        value={size}
        onChange={(e) => setSize(e.target.value)}
        className="h-9 w-16"
        aria-label={`Records per source for a small batch of ${label} (1 to ${MAX_BATCH})`}
        error={!valid}
      />
      <Button
        variant="outline"
        size="sm"
        loading={running}
        disabled={disabled || !valid}
        title={valid ? `Pull up to ${n} records from each source now` : `Choose 1 to ${MAX_BATCH}`}
        onClick={() => onRun(n)}
      >
        <FlaskConical size={14} className="mr-1" aria-hidden />
        Run a small batch
      </Button>
    </div>
  );
}

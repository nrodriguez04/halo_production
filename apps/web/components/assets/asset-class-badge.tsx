import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { ASSET_CLASS_LABEL, ASSET_FILTERS, isAssetClass, subtypeLabel, type AssetFilter } from '@/lib/assets';

const CLASS_VARIANT = {
  residential: 'secondary',
  land: 'success',
  commercial: 'info',
} as const;

/**
 * What kind of property a row is. Unclassified is its own state, never
 * shown as residential: nobody has settled it yet.
 */
export function AssetClassBadge({
  assetClass,
  subtype,
  showSubtype = false,
  className,
}: {
  assetClass: string | null | undefined;
  subtype?: string | null;
  /** Print the subtype beside the class instead of only in the tooltip. */
  showSubtype?: boolean;
  className?: string;
}) {
  const sub = subtypeLabel(subtype);
  if (!isAssetClass(assetClass)) {
    return (
      <Badge variant="warning" className={className} title="Nobody has confirmed what kind of property this is yet.">
        Unclassified
      </Badge>
    );
  }
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-1', className)}>
      <Badge variant={CLASS_VARIANT[assetClass]} title={sub ?? undefined}>
        {ASSET_CLASS_LABEL[assetClass]}
      </Badge>
      {showSubtype && sub && <span className="text-caption text-muted-foreground">{sub}</span>}
    </span>
  );
}

/** All / Residential / Land / Commercial / Unclassified, for a list's `assetClass` query param. */
export function AssetClassFilter({
  value,
  onChange,
  className,
}: {
  value: AssetFilter;
  onChange: (v: AssetFilter) => void;
  className?: string;
}) {
  return (
    <Select
      value={value}
      onChange={(e) => onChange(e.target.value as AssetFilter)}
      className={cn('w-44', className)}
      aria-label="Filter by asset class"
    >
      {ASSET_FILTERS.map((f) => (
        <option key={f.value} value={f.value}>
          {f.label}
        </option>
      ))}
    </Select>
  );
}

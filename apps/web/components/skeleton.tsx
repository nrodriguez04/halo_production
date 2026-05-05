import { cn } from '@/lib/utils';

// True shimmer skeleton: a translucent gradient sweeps across the
// muted background so loading surfaces feel alive instead of plain.
// Falls back to a static muted block when prefers-reduced-motion is on
// because globals.css zeroes the shimmer animation duration.
const SHIMMER_BG =
  'bg-gradient-to-r from-muted/50 via-muted/80 to-muted/50 bg-[length:200%_100%]';

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      role="status"
      aria-label="Loading..."
      className={cn(
        'rounded-md',
        SHIMMER_BG,
        'animate-shimmer',
        className,
      )}
    />
  );
}

export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-5 space-y-3 shadow-1',
        className,
      )}
    >
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-7 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  );
}

export function SkeletonTableRow({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 border-b border-border px-4 py-3">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className={cn('h-4', i === 0 ? 'flex-1' : 'w-24')} />
      ))}
    </div>
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn('h-3', i === lines - 1 ? 'w-2/3' : 'w-full')}
        />
      ))}
    </div>
  );
}

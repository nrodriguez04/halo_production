'use client';

import * as React from 'react';
import { Loader2, AlertTriangle, Inbox, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/skeleton';
import { Button } from '@/components/ui/button';

// Shared async-state primitives. Pages that fetch data should use these
// instead of one-off loading/error/empty fragments so loading skeletons
// look the same everywhere and error CTAs are consistent.

export interface LoadingStateProps {
  /** Optional label rendered under the spinner. Falls back to a generic message. */
  label?: string;
  className?: string;
  /** Render a content-shaped skeleton instead of the spinner-and-label
   *  treatment. Pass the rendered skeleton (e.g. SkeletonTable, custom
   *  card lattice) via children. */
  skeleton?: boolean;
  children?: React.ReactNode;
}

/**
 * Default loading state. Use bare for centered spinners in panels;
 * pass `skeleton` and a children skeleton for in-place placeholders
 * that match the eventual content shape.
 */
export function LoadingState({ label = 'Loading…', className, skeleton, children }: LoadingStateProps) {
  if (skeleton) {
    return <div className={cn('animate-fade-in', className)}>{children}</div>;
  }
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col items-center justify-center gap-3 py-12 text-muted-foreground', className)}
    >
      <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      <p className="text-body">{label}</p>
    </div>
  );
}

export interface EmptyStateProps {
  /** lucide-react icon component. */
  icon?: LucideIcon;
  title: string;
  description?: React.ReactNode;
  /** Primary CTA -- typically a `<Link>` wrapped Button or a Button.
   *  Pass JSX so the action can mutate, navigate, or open a dialog. */
  action?: React.ReactNode;
  className?: string;
}

/**
 * Used when a list/page has loaded successfully but has no rows. The
 * default Inbox icon is intentionally generic; pass the page-specific
 * icon (Users, Handshake, etc.) to make empties feel particular.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card/60 px-8 py-14 text-center',
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon size={22} className="text-muted-foreground" aria-hidden />
      </div>
      <h3 className="text-h3 font-semibold text-foreground">{title}</h3>
      {description && (
        <p className="mt-1 max-w-md text-body text-muted-foreground">{description}</p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  description?: React.ReactNode;
  /** Show a retry button when set. The handler usually calls
   *  `query.refetch()` or `mutation.reset()` from react-query. */
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'We hit an unexpected error loading this view.',
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-destructive/30 bg-destructive/10 px-8 py-12 text-center',
        className,
      )}
    >
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/20">
        <AlertTriangle size={22} className="text-destructive" aria-hidden />
      </div>
      <h3 className="text-h3 font-semibold text-foreground">{title}</h3>
      <p className="mt-1 max-w-md text-body text-muted-foreground">{description}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-5" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

// Convenience: a shimmery row table skeleton matching the `Table`
// primitive's vertical rhythm. Pages can drop this in while data
// loads instead of rolling their own.
export function SkeletonTable({ rows = 6, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid grid-cols-1 divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3">
            {Array.from({ length: cols }).map((_, c) => (
              <Skeleton
                key={c}
                className={cn('h-4', c === 0 ? 'flex-1' : 'w-24')}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

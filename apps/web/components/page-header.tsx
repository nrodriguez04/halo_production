'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

export interface PageHeaderProps {
  title: string;
  /** Sub-line. Use for context, not for a second heading. */
  description?: React.ReactNode;
  /** Right-aligned slot for primary actions (Buttons/Links). */
  actions?: React.ReactNode;
  /** Optional eyebrow: small uppercase label sitting above the title.
   *  Useful for breadcrumbs / category tags. */
  eyebrow?: React.ReactNode;
  className?: string;
}

/**
 * Standardized page header. Every top-level page should render this
 * once at the top of its content area so titles and actions live in
 * the same horizontal band across the app.
 */
export function PageHeader({ title, description, actions, eyebrow, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        'flex flex-col gap-3 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="space-y-1">
        {eyebrow && (
          <p className="text-caption font-semibold uppercase tracking-wider text-muted-foreground">
            {eyebrow}
          </p>
        )}
        <h1 className="text-h1 font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="text-body text-muted-foreground max-w-2xl">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

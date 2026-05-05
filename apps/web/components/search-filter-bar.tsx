'use client';

import * as React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export interface SearchFilterBarProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Right-aligned filter slot (e.g. Selects, Switches). */
  filters?: React.ReactNode;
  /** Trailing slot, typically primary action buttons (New, Import). */
  actions?: React.ReactNode;
  className?: string;
}

/**
 * Standardized search bar with leading icon, optional filter chips on
 * the right, and an actions slot. Replaces ad-hoc `<input>` + filter
 * combos peppered through list pages.
 */
export function SearchFilterBar({
  value,
  onChange,
  placeholder = 'Search…',
  filters,
  actions,
  className,
}: SearchFilterBarProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      <div className="relative w-full max-w-md">
        <Search
          size={16}
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          type="search"
          inputMode="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="pl-9"
        />
      </div>
      {(filters || actions) && (
        <div className="flex flex-wrap items-center gap-2">
          {filters}
          {actions}
        </div>
      )}
    </div>
  );
}

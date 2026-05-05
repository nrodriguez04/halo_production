import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, error, ...props }, ref) => (
    <div className="relative">
      <select
        ref={ref}
        aria-invalid={error || undefined}
        className={cn(
          'flex h-10 w-full appearance-none rounded-md border border-input bg-background px-3 pr-9 py-2 text-sm',
          'ring-offset-background',
          'transition-[border-color,box-shadow,background-color] duration-fast ease-out-expo',
          'hover:border-muted-foreground/40',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-transparent',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
      />
    </div>
  ),
);
Select.displayName = 'Select';

export { Select };

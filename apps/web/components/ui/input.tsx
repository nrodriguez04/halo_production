import * as React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Error message hint -- when set, the input renders the error ring
   *  via aria-invalid and a red focus ring. Pair with form-level error
   *  display; this just styles the field. */
  error?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, error, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      aria-invalid={error || undefined}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
        'ring-offset-background placeholder:text-muted-foreground',
        'transition-[border-color,box-shadow,background-color] duration-fast ease-out-expo',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium',
        'hover:border-muted-foreground/40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:border-transparent',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'aria-[invalid=true]:border-destructive aria-[invalid=true]:focus-visible:ring-destructive',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };

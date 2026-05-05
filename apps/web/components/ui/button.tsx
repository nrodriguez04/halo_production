import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

// Button variants. Hover lift comes from the new shadow-2 token; the
// active state pulls back via translate-y so clicks feel tactile.
// Reduced-motion users skip both because globals.css zeroes the
// underlying durations.
const buttonVariants = cva(
  cn(
    'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-sm font-medium select-none',
    'ring-offset-background transition-[background-color,color,box-shadow,transform,opacity] duration-fast ease-out-expo',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:translate-y-px',
  ),
  {
    variants: {
      variant: {
        default: cn(
          'bg-primary text-primary-foreground shadow-1',
          'hover:bg-primary/90 hover:shadow-2 hover:-translate-y-px',
        ),
        destructive: cn(
          'bg-destructive text-destructive-foreground shadow-1',
          'hover:bg-destructive/90 hover:shadow-2 hover:-translate-y-px',
        ),
        outline: cn(
          'border border-input bg-transparent text-foreground',
          'hover:bg-muted hover:border-muted-foreground/40',
        ),
        secondary: cn(
          'bg-secondary text-secondary-foreground',
          'hover:bg-secondary/80 hover:shadow-1',
        ),
        ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3 text-sm',
        lg: 'h-11 rounded-md px-6 text-base',
        icon: 'h-10 w-10',
        'icon-sm': 'h-8 w-8 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Render as the child element (Radix Slot). Used for `<Link>` buttons. */
  asChild?: boolean;
  /** Show a spinner and disable the button. Pairs with mutation states. */
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading = false, disabled, children, ...props }, ref) => {
    const Comp: any = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            <span>{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };

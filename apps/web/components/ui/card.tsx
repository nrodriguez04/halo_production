import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// `interactive` is the new lift-on-hover variant; the default Card
// stays static so list rows and large dashboards don't shift on
// pointer move.
const cardVariants = cva(
  'rounded-lg border border-border bg-card text-card-foreground transition-[box-shadow,transform,border-color] duration-base ease-out-expo',
  {
    variants: {
      variant: {
        default: 'shadow-1',
        interactive: cn(
          'shadow-1 cursor-pointer',
          'hover:shadow-2 hover:-translate-y-0.5 hover:border-border/60',
          'focus-within:shadow-2 focus-within:-translate-y-0.5',
        ),
        flat: 'shadow-none',
        elevated: 'shadow-2',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface CardProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof cardVariants> {}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant, ...props }, ref) => (
    <div ref={ref} className={cn(cardVariants({ variant }), className)} {...props} />
  ),
);
Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex flex-col space-y-1 p-6', className)} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

// `CardTitle` previously read at `text-sm muted` -- so small it disappeared
// against body copy. It now uses the new h3 token (18/28) and the
// foreground color so cards have a real label.
const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={cn('text-h3 font-semibold tracking-tight text-foreground', className)}
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn('text-body text-muted-foreground', className)} {...props} />
  ),
);
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('p-6 pt-0', className)} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('flex items-center p-6 pt-0', className)} {...props} />
  ),
);
CardFooter.displayName = 'CardFooter';

export {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  cardVariants,
};

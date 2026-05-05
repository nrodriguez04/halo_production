import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

// Alert is the inline-callout pattern (banner/notice). For ephemeral
// feedback after a mutation, use the Toast component instead.
const alertVariants = cva(
  cn(
    'relative w-full rounded-md border px-4 py-3 text-body',
    '[&>svg]:absolute [&>svg]:left-4 [&>svg]:top-3.5 [&>svg]:h-4 [&>svg]:w-4 [&>svg+div]:translate-y-[-3px]',
    '[&:has(svg)]:pl-11',
  ),
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground [&>svg]:text-muted-foreground',
        info: 'border-blue-500/30 bg-blue-500/10 text-blue-200 [&>svg]:text-blue-400',
        success: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 [&>svg]:text-emerald-400',
        warning: 'border-amber-500/30 bg-amber-500/10 text-amber-200 [&>svg]:text-amber-400',
        destructive: 'border-destructive/40 bg-destructive/10 text-destructive [&>svg]:text-destructive',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

const VARIANT_ICON: Record<NonNullable<VariantProps<typeof alertVariants>['variant']>, React.ComponentType<any>> = {
  default: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  destructive: AlertCircle,
};

interface AlertProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof alertVariants> {
  /** Hide the auto-rendered icon. Useful for compact alerts. */
  hideIcon?: boolean;
}

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, hideIcon, children, ...props }, ref) => {
    const Icon = VARIANT_ICON[variant ?? 'default'];
    return (
      <div
        ref={ref}
        role="alert"
        className={cn(alertVariants({ variant }), className)}
        {...props}
      >
        {!hideIcon && <Icon aria-hidden="true" />}
        <div>{children}</div>
      </div>
    );
  },
);
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5 ref={ref} className={cn('mb-1 font-semibold leading-tight', className)} {...props} />
  ),
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn('text-body opacity-90 [&_p]:leading-relaxed', className)} {...props} />
  ),
);
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };

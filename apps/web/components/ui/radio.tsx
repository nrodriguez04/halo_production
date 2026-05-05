'use client';

import * as React from 'react';
import * as RadioPrimitive from '@radix-ui/react-radio-group';
import { cn } from '@/lib/utils';

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof RadioPrimitive.Root>
>(({ className, ...props }, ref) => (
  <RadioPrimitive.Root ref={ref} className={cn('grid gap-2', className)} {...props} />
));
RadioGroup.displayName = RadioPrimitive.Root.displayName;

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof RadioPrimitive.Item>
>(({ className, ...props }, ref) => (
  <RadioPrimitive.Item
    ref={ref}
    className={cn(
      'aspect-square h-4 w-4 rounded-full border border-input bg-background text-primary',
      'transition-[border-color,box-shadow] duration-fast ease-out-expo',
      'hover:border-muted-foreground/40',
      'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      'disabled:cursor-not-allowed disabled:opacity-50',
      'data-[state=checked]:border-primary',
      className,
    )}
    {...props}
  >
    <RadioPrimitive.Indicator className="flex items-center justify-center">
      <span className="block h-2 w-2 rounded-full bg-primary" />
    </RadioPrimitive.Indicator>
  </RadioPrimitive.Item>
));
RadioGroupItem.displayName = RadioPrimitive.Item.displayName;

export { RadioGroup, RadioGroupItem };

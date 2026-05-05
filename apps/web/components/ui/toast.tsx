'use client';

import * as React from 'react';
import { Toaster as SonnerToaster, toast as sonnerToast } from 'sonner';

// Sonner toaster wired to the Halo dark theme. Default ToastIconProps
// pulls colors from CSS vars so a future theme tweak doesn't need
// changes here.
export function Toaster() {
  return (
    <SonnerToaster
      position="top-right"
      richColors
      closeButton
      theme="dark"
      toastOptions={{
        classNames: {
          toast:
            'group rounded-md border border-border bg-card text-card-foreground shadow-overlay backdrop-blur-sm',
          title: 'text-body font-medium text-foreground',
          description: 'text-caption text-muted-foreground',
          actionButton:
            'rounded-md bg-primary px-2 py-1 text-caption font-medium text-primary-foreground',
          cancelButton:
            'rounded-md bg-secondary px-2 py-1 text-caption font-medium text-secondary-foreground',
          closeButton:
            'rounded-md border border-border bg-card text-muted-foreground hover:text-foreground',
          success: 'border-emerald-500/30 [&_[data-icon]]:text-emerald-400',
          error: 'border-destructive/40 [&_[data-icon]]:text-destructive',
          warning: 'border-amber-500/30 [&_[data-icon]]:text-amber-400',
          info: 'border-blue-500/30 [&_[data-icon]]:text-blue-400',
        },
      }}
    />
  );
}

// Re-export sonner's `toast()` so feature code imports from one place.
// Use as: `toast.success('Lead qualified')` or `toast.error(...)`.
export const toast = sonnerToast;

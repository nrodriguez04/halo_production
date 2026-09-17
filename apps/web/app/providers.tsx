'use client';

import { useState } from 'react';
import { AuthProvider } from '@descope/nextjs-sdk';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toast';

export function Providers({ children }: { children: React.ReactNode }) {
  const projectId = process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID;
  // Projects using a Descope custom domain (Session Management = "Manage in
  // Cookies") issue and read session cookies on that domain. The server SDK
  // picks NEXT_PUBLIC_DESCOPE_BASE_URL up on its own, but the client provider
  // needs it passed explicitly — without it the browser talks to
  // api.descope.com and the OAuth code exchange fails with E061301.
  const baseUrl = process.env.NEXT_PUBLIC_DESCOPE_BASE_URL;

  // useState ensures the QueryClient is created exactly once per browser tab.
  // Defaults: data is treated fresh for 30s (no refetch on focus during that
  // window), retry once with exponential backoff, no global refetch on reconnect.
  // These match a CRM-style app where users expect data to feel snappy after
  // navigation but tolerate brief staleness over re-fetching constantly.
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: false,
            retry: (failureCount, error: any) => {
              if (error?.status === 401 || error?.status === 403) return false;
              return failureCount < 1;
            },
          },
        },
      }),
  );

  if (!projectId) {
    return (
      <div style={{ padding: '2rem', color: '#b91c1c' }}>
        Missing NEXT_PUBLIC_DESCOPE_PROJECT_ID in apps/web/.env.local
      </div>
    );
  }

  return (
    <AuthProvider projectId={projectId} baseUrl={baseUrl}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={250} skipDelayDuration={150}>
          {children}
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

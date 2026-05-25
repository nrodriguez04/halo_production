'use client';

import { useEffect, useState } from 'react';
import { AuthProvider } from '@descope/nextjs-sdk';
import { useSession } from '@descope/nextjs-sdk/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toast';
import { syncApiAuthState } from '@/lib/api-fetch';

function ApiAuthSessionSync() {
  const { isAuthenticated, isSessionLoading, sessionToken } = useSession();

  useEffect(() => {
    syncApiAuthState({
      ready: !isSessionLoading,
      token: isAuthenticated ? sessionToken : undefined,
    });
  }, [isAuthenticated, isSessionLoading, sessionToken]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const projectId = process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID;

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
    <AuthProvider projectId={projectId}>
      <ApiAuthSessionSync />
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={250} skipDelayDuration={150}>
          {children}
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

'use client';

import { AuthProvider } from '@descope/nextjs-sdk';

export function Providers({ children }: { children: React.ReactNode }) {
  const projectId = process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID;

  if (!projectId) {
    return (
      <div style={{ padding: '2rem', color: '#b91c1c' }}>
        Missing NEXT_PUBLIC_DESCOPE_PROJECT_ID in apps/web/.env.local
      </div>
    );
  }

  return (
    <AuthProvider projectId={projectId}>
      {children}
    </AuthProvider>
  );
}

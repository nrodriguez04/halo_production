'use client';

import { Descope } from '@descope/nextjs-sdk';
import { useRouter } from 'next/navigation';

export default function SignInPage() {
  const router = useRouter();
  const projectId = process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID;
  const flowId = process.env.NEXT_PUBLIC_DESCOPE_FLOW_ID;

  if (!projectId || !flowId) {
    return (
      <main className="grid place-items-center min-h-screen bg-background">
        <div className="text-destructive text-sm">
          Missing Descope env vars in apps/web/.env.local
        </div>
      </main>
    );
  }

  return (
    <main className="grid place-items-center min-h-screen bg-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-primary mb-2">Hālo</h1>
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
        </div>
        <Descope
          flowId={flowId}
          onSuccess={() => router.push('/dashboard')}
          onError={(e: any) => console.error('Descope flow error:', e)}
        />
      </div>
    </main>
  );
}

'use client';

import { Descope } from '@descope/nextjs-sdk';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft } from 'lucide-react';

export default function SignInPage() {
  const router = useRouter();
  const projectId = process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID;
  const flowId = process.env.NEXT_PUBLIC_DESCOPE_FLOW_ID;

  if (!projectId || !flowId) {
    return (
      <main className="grid min-h-screen place-items-center bg-background p-4">
        <Alert variant="destructive" className="max-w-md">
          <AlertTitle>Missing configuration</AlertTitle>
          <AlertDescription>
            Set <code className="font-mono text-caption">NEXT_PUBLIC_DESCOPE_PROJECT_ID</code> and{' '}
            <code className="font-mono text-caption">NEXT_PUBLIC_DESCOPE_FLOW_ID</code> in{' '}
            <code className="font-mono text-caption">apps/web/.env.local</code>.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <main className="relative grid min-h-screen place-items-center bg-background px-4">
      {/* Same radial fade as the marketing page so brand chrome stays consistent. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 60% 40% at 50% 0%, hsl(var(--primary) / 0.15), transparent 70%)',
        }}
      />

      <div className="relative w-full max-w-md animate-fade-up">
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-md text-caption text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowLeft size={12} aria-hidden />
            Back
          </Link>
        </div>

        <div className="mb-8 text-center">
          <h1 className="text-display font-bold tracking-tight text-primary">Hālo</h1>
          <p className="mt-1 text-body text-muted-foreground">Sign in to continue</p>
        </div>

        <Card variant="elevated" className="animate-scale-in">
          <CardContent className="p-6">
            <Descope
              flowId={flowId}
              onSuccess={() => router.push('/dashboard')}
              onError={(e: any) => console.error('Descope flow error:', e)}
            />
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-caption text-muted-foreground">
          Internal Hālo platform · Production environment
        </p>
      </div>
    </main>
  );
}

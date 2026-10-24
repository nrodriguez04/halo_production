'use client';

import { Descope } from '@descope/nextjs-sdk';
import { useDescope } from '@descope/nextjs-sdk/client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ArrowLeft, RotateCw } from 'lucide-react';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { takeSignInReason } from '@/lib/api-fetch';

/** How long the Descope form may take to appear before the page says so. */
const FORM_TIMEOUT_MS = 10_000;

interface DescopeError {
  errorCode?: string;
  errorDescription?: string;
  errorMessage?: string;
}

export default function SignInPage() {
  const router = useRouter();
  const projectId = process.env.NEXT_PUBLIC_DESCOPE_PROJECT_ID;
  const flowId = process.env.NEXT_PUBLIC_DESCOPE_FLOW_ID;
  // The form is Descope's: it loads from descope.com. When that is blocked
  // (an ad or privacy blocker, a network filter) or a sign-in fails, say so
  // instead of leaving an empty card or an error only in the console.
  const [ready, setReady] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Why the app sent you here, when the API refused your session.
  const [refused, setRefused] = useState<string | null>(null);
  const sdk = useDescope();

  useEffect(() => {
    setRefused(takeSignInReason());
  }, []);

  useEffect(() => {
    if (ready) return;
    const t = setTimeout(() => setSlow(true), FORM_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [ready]);

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
            className="inline-flex items-center gap-1 rounded-md text-caption text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowLeft size={12} aria-hidden />
            Back
          </Link>
        </div>

        <div className="mb-8 text-center">
          <h1 className="flex justify-center">
            <Logo height={56} priority />
          </h1>
          <p className="mt-1 text-body text-muted-foreground">Sign in to continue</p>
        </div>

        {refused && (
          <Alert variant="destructive" className="mb-4">
            <AlertTitle>Signed in at Descope, but the Hålo API refused the session</AlertTitle>
            <AlertDescription className="space-y-2">
              <p>{refused}</p>
              {/tenant|account claim/i.test(refused) && (
                <p>
                  Your Descope user is not in a tenant, so the API cannot tell which account it belongs to. In the Descope
                  console, add the user to the tenant with a role (Tenant Admin for full access), then sign out and sign in
                  again.
                </p>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={async () => {
                  await sdk.logout();
                  setRefused(null);
                  window.location.reload();
                }}
              >
                Sign out of Descope
              </Button>
            </AlertDescription>
          </Alert>
        )}

        <Card variant="elevated" className="animate-scale-in">
          <CardContent className="p-6">
            <Descope
              flowId={flowId}
              onReady={() => {
                setReady(true);
                setSlow(false);
              }}
              onSuccess={() => router.push('/dashboard')}
              onError={(e: CustomEvent<DescopeError>) => {
                const d = e.detail ?? {};
                console.error('Descope flow error:', d);
                setError(
                  [d.errorDescription || d.errorMessage || 'Sign-in failed.', d.errorCode && `(${d.errorCode})`]
                    .filter(Boolean)
                    .join(' '),
                );
              }}
            />
            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertTitle>Sign-in did not complete</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {slow && !ready && (
              <Alert className="mt-4">
                <AlertTitle>The sign-in form has not loaded</AlertTitle>
                <AlertDescription className="space-y-2">
                  <p>
                    It comes from Descope (descope.com). An ad or privacy blocker, or a network filter, can stop it.
                    Allow descope.com, or try a private window.
                  </p>
                  <Button size="sm" variant="outline" onClick={() => window.location.reload()}>
                    <RotateCw size={14} className="mr-1" aria-hidden /> Try again
                  </Button>
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-caption text-muted-foreground">
          Hålo Platform by Halawa Realty Investment Group
        </p>
      </div>
    </main>
  );
}

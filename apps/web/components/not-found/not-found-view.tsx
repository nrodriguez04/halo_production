'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, Home, LayoutDashboard } from 'lucide-react';
import { useSession } from '@descope/nextjs-sdk/client';
import { Logo } from '@/components/brand/logo';
import { Button } from '@/components/ui/button';
import { suggestRoutes } from '@/lib/app-routes';
import { RouteDebugger } from './route-debugger';

/**
 * The 404 page: what was asked for, the pages it most likely meant, a way
 * back, and the debugger, which explains what the app and the API see.
 */
export function NotFoundView() {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const { isAuthenticated } = useSession();
  const suggestions = suggestRoutes(pathname);

  return (
    <main className="relative min-h-screen bg-background px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 60% 35% at 50% 0%, hsl(var(--primary) / 0.14), transparent 70%)',
        }}
      />

      <div className="relative mx-auto w-full max-w-4xl animate-fade-up">
        <header className="mb-14 flex items-center justify-between">
          <Link
            href={isAuthenticated ? '/dashboard' : '/'}
            aria-label="Hålo home"
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <Logo height={28} priority />
          </Link>
        </header>

        <section className="text-center">
          <p
            className="bg-gradient-to-b from-primary to-primary/30 bg-clip-text font-mono text-[7rem] font-bold leading-none tracking-tighter text-transparent sm:text-[9rem]"
            aria-hidden
          >
            404
          </p>
          <h1 className="mt-2 text-h1 font-semibold tracking-tight text-foreground">This page does not exist</h1>
          <p className="mx-auto mt-3 max-w-xl text-body text-muted-foreground">
            Nothing lives at{' '}
            <code className="break-all rounded bg-secondary px-1.5 py-0.5 font-mono text-caption text-foreground">
              {pathname}
            </code>
            . The link may be mistyped, or the page may have moved.
          </p>

          {suggestions.length > 0 && (
            <div className="mx-auto mt-8 max-w-xl">
              <p className="text-caption font-medium uppercase tracking-wider text-muted-foreground">Did you mean</p>
              <ul className="mt-3 flex flex-wrap justify-center gap-2">
                {suggestions.map((r) => (
                  <li key={r.path} className="w-full sm:w-56">
                    <Link
                      href={r.path}
                      className="group flex h-full items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-body font-medium text-foreground">{r.label}</span>
                        <span className="block truncate font-mono text-caption text-muted-foreground">{r.path}</span>
                      </span>
                      <ArrowRight
                        size={14}
                        className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary"
                        aria-hidden
                      />
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg">
              {isAuthenticated ? (
                <Link href="/dashboard">
                  <LayoutDashboard size={16} className="mr-2" aria-hidden /> Go to the dashboard
                </Link>
              ) : (
                <Link href="/">
                  <Home size={16} className="mr-2" aria-hidden /> Go home
                </Link>
              )}
            </Button>
            <Button size="lg" variant="outline" onClick={() => router.back()}>
              <ArrowLeft size={16} className="mr-2" aria-hidden /> Go back
            </Button>
          </div>
        </section>

        <div className="mt-14">
          <RouteDebugger pathname={pathname} />
        </div>
      </div>
    </main>
  );
}

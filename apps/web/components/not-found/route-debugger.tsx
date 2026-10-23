'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bug, Check, ChevronDown, Copy, RotateCw } from 'lucide-react';
import { useSession, useUser } from '@descope/nextjs-sdk/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const API = process.env.NEXT_PUBLIC_API_URL ?? '';
const OPEN_KEY = 'halo.debugger.open';

type Tone = 'ok' | 'warn' | 'bad' | 'info';

interface Health {
  state: 'pending' | 'ok' | 'degraded' | 'down';
  latencyMs?: number;
  database?: string;
  redis?: string;
  error?: string;
}

interface ApiSession {
  state: 'pending' | 'ok' | 'refused' | 'error';
  httpStatus?: number;
  message?: string;
  data?: {
    accountId: string | null;
    userId: string | null;
    roles: string[];
    permissions: string[];
    admin: boolean;
    tenants: string[];
    expiresAt: string | null;
    devBypass: boolean;
  };
}

/** The claims of a session JWT, read without verifying it: for display only. */
function readClaims(token?: string | null): Record<string, unknown> | null {
  const part = token?.split('.')[1];
  if (!part) return null;
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64.padEnd(Math.ceil(b64.length / 4) * 4, '=')));
  } catch {
    return null;
  }
}

function storageWorks(): boolean {
  try {
    const k = '__halo_probe__';
    localStorage.setItem(k, '1');
    localStorage.removeItem(k);
    return true;
  } catch {
    return false;
  }
}

/**
 * What the app and the API see right now, for working out why a page is
 * missing or a session misbehaves. Reads only: it calls the API's health
 * check and /auth/session, and never shows or copies the session token.
 */
export function RouteDebugger({ pathname }: { pathname: string }) {
  const { isAuthenticated, isSessionLoading, sessionToken } = useSession();
  const { user } = useUser();
  const [open, setOpen] = useState(true);
  const [health, setHealth] = useState<Health>({ state: 'pending' });
  const [apiSession, setApiSession] = useState<ApiSession>({ state: 'pending' });
  const [client, setClient] = useState<Record<string, string> | null>(null);
  const [request, setRequest] = useState<Record<string, string> | null>(null);
  const [copied, setCopied] = useState(false);
  const [runs, setRuns] = useState(0);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(OPEN_KEY);
      if (saved !== null) setOpen(saved === '1');
    } catch {
      // Storage blocked: stay open.
    }
  }, []);

  const toggle = () => {
    setOpen((o) => {
      try {
        localStorage.setItem(OPEN_KEY, o ? '0' : '1');
      } catch {
        // Not remembered.
      }
      return !o;
    });
  };

  // What only the browser knows.
  useEffect(() => {
    const now = new Date();
    setRequest({
      path: pathname,
      query: window.location.search || '(none)',
      hash: window.location.hash || '(none)',
      referrer: document.referrer || '(none: typed, bookmarked or opened directly)',
      at: now.toISOString(),
      localTime: now.toLocaleString(),
    });
    setClient({
      userAgent: navigator.userAgent,
      language: navigator.language,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      viewport: `${window.innerWidth} x ${window.innerHeight} @${window.devicePixelRatio}x`,
      online: navigator.onLine ? 'yes' : 'no',
      cookies: navigator.cookieEnabled ? 'enabled' : 'disabled',
      localStorage: storageWorks() ? 'available' : 'blocked',
    });
  }, [pathname]);

  const runChecks = useCallback(async () => {
    setHealth({ state: 'pending' });
    setApiSession({ state: 'pending' });
    if (!API) {
      setHealth({ state: 'down', error: 'NEXT_PUBLIC_API_URL is not set in this build' });
      setApiSession({ state: 'error', message: 'No API address' });
      return;
    }
    const started = performance.now();
    try {
      const res = await fetch(`${API}/health`, { cache: 'no-store' });
      const body = (await res.json().catch(() => ({}))) as {
        status?: string;
        database?: { status?: string };
        redis?: { status?: string };
      };
      setHealth({
        state: res.ok && body.status === 'ok' ? 'ok' : res.ok ? 'degraded' : 'down',
        latencyMs: Math.round(performance.now() - started),
        database: body.database?.status ?? 'unknown',
        redis: body.redis?.status ?? 'unknown',
        error: res.ok ? undefined : `HTTP ${res.status}`,
      });
    } catch (err) {
      setHealth({ state: 'down', error: (err as Error).message || 'No answer' });
    }
    try {
      const res = await fetch(`${API}/auth/session`, {
        cache: 'no-store',
        headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {},
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.ok) {
        setApiSession({ state: 'ok', httpStatus: res.status, data: body as ApiSession['data'] });
      } else {
        const m = Array.isArray(body.message) ? body.message.join(' ') : (body.message as string | undefined);
        setApiSession({ state: 'refused', httpStatus: res.status, message: m || `HTTP ${res.status}` });
      }
    } catch (err) {
      setApiSession({ state: 'error', message: (err as Error).message || 'No answer' });
    }
  }, [sessionToken]);

  useEffect(() => {
    if (isSessionLoading) return;
    void runChecks();
  }, [isSessionLoading, runChecks, runs]);

  const claims = useMemo(() => readClaims(sessionToken), [sessionToken]);
  const tokenTenants = useMemo(() => {
    const t = claims?.tenants;
    if (!t || typeof t !== 'object') return [] as Array<{ id: string; roles: string[] }>;
    return Object.entries(t as Record<string, { roles?: string[] }>).map(([id, v]) => ({
      id,
      roles: Array.isArray(v?.roles) ? v.roles : [],
    }));
  }, [claims]);
  const tokenExpires = typeof claims?.exp === 'number' ? new Date(claims.exp * 1000) : null;

  const build = {
    commit: process.env.NEXT_PUBLIC_BUILD_SHA ?? 'unknown',
    builtAt: process.env.NEXT_PUBLIC_BUILD_TIME ?? 'unknown',
    next: process.env.NEXT_PUBLIC_NEXT_VERSION ?? 'unknown',
    mode: process.env.NODE_ENV ?? 'unknown',
    api: API || '(not set)',
  };

  // What all of it means, worst first.
  const findings = useMemo(() => {
    const out: Array<{ tone: Tone; text: string }> = [];
    if (health.state === 'down') {
      out.push({ tone: 'bad', text: `The API at ${build.api} does not answer (${health.error}). Is it running?` });
    } else if (health.state === 'degraded') {
      out.push({ tone: 'warn', text: `The API answers but is not healthy: database ${health.database}, Redis ${health.redis}.` });
    }
    if (!isSessionLoading && isAuthenticated && claims && tokenTenants.length === 0) {
      out.push({
        tone: 'warn',
        text: 'Your Descope session names no tenant, so the API will refuse it. Add your user to a tenant, with a role, in the Descope console.',
      });
    }
    if (apiSession.state === 'refused' && isAuthenticated) {
      out.push({ tone: 'warn', text: `The API refused your session (${apiSession.httpStatus}): ${apiSession.message}` });
    }
    if (apiSession.state === 'ok' && apiSession.data?.devBypass) {
      out.push({ tone: 'info', text: 'The API is running with the development auth bypass: every request is treated as signed in.' });
    }
    if (!isSessionLoading && !isAuthenticated) {
      out.push({ tone: 'info', text: 'You are not signed in.' });
    }
    if (pathname.startsWith('/api/')) {
      out.push({ tone: 'info', text: `API routes are served by the API (${build.api}), not by this site.` });
    }
    const idRoute = pathname.match(/^\/(deals|buyers|markets)\/[^/]+\/.+/);
    if (idRoute) {
      out.push({ tone: 'info', text: `${idRoute[1]} pages take one segment after the id-less path: /${idRoute[1]}/<id>.` });
    }
    if (out.every((f) => f.tone === 'info') && health.state === 'ok') {
      out.unshift({ tone: 'ok', text: 'The app and the API are working: this page simply does not exist.' });
    }
    return out;
  }, [health, apiSession, isAuthenticated, isSessionLoading, claims, tokenTenants.length, pathname, build.api]);

  /** The report to paste into a bug: no name, email or token. */
  const report = useMemo(
    () => ({
      request,
      session: {
        signedIn: isAuthenticated,
        tokenExpires: tokenExpires?.toISOString() ?? null,
        tenants: tokenTenants,
      },
      api: { health, session: apiSession.state === 'ok' ? apiSession.data : apiSession },
      build,
      browser: client,
      findings: findings.map((f) => `${f.tone}: ${f.text}`),
    }),
    // build is derived from constants
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [request, isAuthenticated, tokenExpires, tokenTenants, health, apiSession, client, findings],
  );

  const copy = async () => {
    const text = JSON.stringify(report, null, 2);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    // One line for whoever has the console open.
    console.warn('[404]', pathname, report);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const healthBadge =
    health.state === 'pending' ? (
      <Badge variant="secondary">API: checking</Badge>
    ) : health.state === 'ok' ? (
      <Badge variant="success">API: up · {health.latencyMs} ms</Badge>
    ) : health.state === 'degraded' ? (
      <Badge variant="warning">API: degraded</Badge>
    ) : (
      <Badge variant="destructive">API: down</Badge>
    );

  return (
    <Card className="overflow-hidden">
      <CardHeader className="gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className="flex items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Bug size={16} className="text-primary" aria-hidden />
          <CardTitle>Debugger</CardTitle>
          <ChevronDown
            size={16}
            className={cn('text-muted-foreground transition-transform', open ? 'rotate-0' : '-rotate-90')}
            aria-hidden
          />
        </button>
        <div className="flex flex-wrap items-center gap-2">
          {healthBadge}
          <Badge variant={isSessionLoading ? 'secondary' : isAuthenticated ? 'success' : 'outline'}>
            {isSessionLoading ? 'Session: loading' : isAuthenticated ? 'Signed in' : 'Signed out'}
          </Badge>
          <Button size="sm" variant="ghost" onClick={() => setRuns((n) => n + 1)} aria-label="Run the checks again">
            <RotateCw size={14} className="mr-1" aria-hidden /> Re-run
          </Button>
          <Button size="sm" variant="outline" onClick={copy}>
            {copied ? <Check size={14} className="mr-1" aria-hidden /> : <Copy size={14} className="mr-1" aria-hidden />}
            {copied ? 'Copied' : 'Copy report'}
          </Button>
        </div>
      </CardHeader>

      {open && (
        <CardContent className="space-y-5 pt-5">
          <ul className="space-y-2" aria-label="Findings">
            {findings.map((f) => (
              <li key={f.text} className="flex items-start gap-2 text-body">
                <span
                  aria-hidden
                  className={cn(
                    'mt-2 h-2 w-2 shrink-0 rounded-full',
                    f.tone === 'ok' && 'bg-emerald-400',
                    f.tone === 'warn' && 'bg-amber-400',
                    f.tone === 'bad' && 'bg-red-400',
                    f.tone === 'info' && 'bg-blue-400',
                  )}
                />
                <span className="text-foreground">{f.text}</span>
              </li>
            ))}
          </ul>

          <div className="grid gap-4 md:grid-cols-2">
            <Section title="Request">
              <Row label="Path" value={request?.path} />
              <Row label="Query" value={request?.query} />
              <Row label="Hash" value={request?.hash} />
              <Row label="Came from" value={request?.referrer} />
              <Row label="At" value={request ? `${request.localTime} (${request.at})` : undefined} />
            </Section>

            <Section title="Session (Descope)">
              <Row label="Signed in" value={isSessionLoading ? 'checking' : isAuthenticated ? 'yes' : 'no'} />
              <Row label="User" value={user ? user.email || user.name || user.loginIds?.[0] || '(no email)' : '(none)'} />
              <Row
                label="Tenants"
                value={
                  tokenTenants.length
                    ? tokenTenants.map((t) => `${t.id}${t.roles.length ? ` (${t.roles.join(', ')})` : ''}`).join('; ')
                    : isAuthenticated
                      ? 'none in the token'
                      : '(none)'
                }
                tone={isAuthenticated && tokenTenants.length === 0 ? 'warn' : undefined}
              />
              <Row
                label="Token expires"
                value={tokenExpires ? `${tokenExpires.toLocaleString()}` : '(no token)'}
                tone={tokenExpires && tokenExpires.getTime() < Date.now() ? 'bad' : undefined}
              />
            </Section>

            <Section title="API">
              <Row label="Address" value={build.api} />
              <Row
                label="Health"
                value={
                  health.state === 'pending'
                    ? 'checking'
                    : health.state === 'down'
                      ? `down: ${health.error}`
                      : `${health.state} in ${health.latencyMs} ms (database ${health.database}, Redis ${health.redis})`
                }
                tone={health.state === 'ok' ? 'ok' : health.state === 'pending' ? undefined : 'bad'}
              />
              {apiSession.state === 'ok' && apiSession.data ? (
                <>
                  <Row label="Account" value={apiSession.data.accountId ?? '(none)'} tone="ok" />
                  <Row label="Roles" value={apiSession.data.roles.join(', ') || '(none)'} />
                  <Row label="Admin" value={apiSession.data.admin ? 'yes' : 'no'} />
                  <Row label="Permissions" value={apiSession.data.permissions.join(', ') || '(none)'} />
                  {apiSession.data.devBypass && <Row label="Auth" value="development bypass" tone="warn" />}
                </>
              ) : (
                <Row
                  label="Your session"
                  value={
                    apiSession.state === 'pending'
                      ? 'checking'
                      : apiSession.state === 'refused'
                        ? `refused (${apiSession.httpStatus}): ${apiSession.message}`
                        : `no answer: ${apiSession.message}`
                  }
                  tone={apiSession.state === 'pending' ? undefined : isAuthenticated ? 'bad' : undefined}
                />
              )}
            </Section>

            <Section title="Build and browser">
              <Row label="Commit" value={build.commit} />
              <Row label="Built" value={build.builtAt} />
              <Row label="Next.js" value={`${build.next} (${build.mode})`} />
              <Row label="Browser" value={client?.userAgent} />
              <Row label="Locale" value={client ? `${client.language}, ${client.timeZone}` : undefined} />
              <Row label="Viewport" value={client?.viewport} />
              <Row
                label="Online, cookies, storage"
                value={client ? `${client.online}, ${client.cookies}, ${client.localStorage}` : undefined}
              />
            </Section>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-background/40 p-4">
      <h2 className="mb-3 text-caption font-semibold uppercase tracking-wider text-muted-foreground">{title}</h2>
      <dl className="space-y-2">{children}</dl>
    </section>
  );
}

function Row({ label, value, tone }: { label: string; value?: string; tone?: Tone }) {
  return (
    <div className="grid grid-cols-[8.5rem_1fr] gap-3 text-caption">
      <dt className="text-muted-foreground">{label}</dt>
      <dd
        className={cn(
          'min-w-0 break-words font-mono text-foreground',
          tone === 'ok' && 'text-emerald-400',
          tone === 'warn' && 'text-amber-400',
          tone === 'bad' && 'text-red-400',
        )}
      >
        {value ?? '…'}
      </dd>
    </div>
  );
}

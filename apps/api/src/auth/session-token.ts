import type { Request } from 'express';

/**
 * Where a request's Descope session token comes from.
 *
 * Locally, Descope returns tokens in the response body and the web app
 * sends the session token as a bearer header. In production Descope can
 * manage tokens in cookies instead: it sets the session cookie (`DS`) on
 * the shared parent domain, the browser sends it to api.<domain> with
 * every credentialed request, and the page's JavaScript may never see the
 * token. Both are accepted; the header wins when both are present.
 *
 * A cookie rides along with requests other sites start, so a state-changing
 * request authenticated by cookie alone must come from an allowed origin
 * (the same list as CORS). Reads are safe either way.
 */

/** Descope's session cookie; `DESCOPE_SESSION_COOKIE` overrides it. */
export function sessionCookieName(): string {
  return process.env.DESCOPE_SESSION_COOKIE || 'DS';
}

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function allowedOrigins(): string[] {
  return (process.env.CORS_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
}

/** One cookie's value from a Cookie header, or null. */
export function readCookie(
  header: string | undefined,
  name: string,
): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    if (part.slice(0, eq).trim() !== name) continue;
    const raw = part.slice(eq + 1).trim();
    try {
      return decodeURIComponent(raw) || null;
    } catch {
      return raw || null;
    }
  }
  return null;
}

/** The origin a browser request came from: its Origin header, else its Referer's origin. */
function requestOrigin(request: Request): string | null {
  const origin = request.headers.origin;
  if (typeof origin === 'string' && origin && origin !== 'null') return origin;
  const referer = request.headers.referer;
  if (typeof referer === 'string' && referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }
  return null;
}

export type SessionToken =
  | { token: string; via: 'header' | 'cookie' }
  | { token: null; reason: string };

export function sessionTokenFrom(
  request: Request,
  origins: string[] = allowedOrigins(),
): SessionToken {
  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ') && header.length > 7) {
    return { token: header.slice(7), via: 'header' };
  }
  const cookie = readCookie(request.headers.cookie, sessionCookieName());
  if (!cookie) return { token: null, reason: 'Missing session token' };
  if (!SAFE_METHODS.has(request.method.toUpperCase())) {
    const origin = requestOrigin(request);
    if (!origin || !origins.includes(origin)) {
      return {
        token: null,
        reason:
          'A session cookie is accepted on this request only from an allowed origin',
      };
    }
  }
  return { token: cookie, via: 'cookie' };
}

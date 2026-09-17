import { NextResponse } from 'next/server';
import { authMiddleware } from '@descope/nextjs-sdk/server';

/**
 * Development-only auth bypass — mirrors apps/api/src/auth/dev-bypass.ts.
 *
 * Both conditions must hold: NODE_ENV is not 'production' (not configurable),
 * and HALO_DEV_AUTH_BYPASS is explicitly 'true'. Deliberately NOT a
 * NEXT_PUBLIC_ variable: middleware runs server-side, so the flag never
 * reaches the browser bundle.
 */
const devAuthBypass =
  process.env.NODE_ENV !== 'production' &&
  process.env.HALO_DEV_AUTH_BYPASS === 'true';

const descopeMiddleware = authMiddleware({
  publicRoutes: ['/', '/sign-in', '/favicon.ico', '/_next', '/api/health'],
  redirectUrl: '/sign-in',
});

export default devAuthBypass ? () => NextResponse.next() : descopeMiddleware;

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

import { authMiddleware } from '@descope/nextjs-sdk/server';

export default authMiddleware({
  publicRoutes: ['/', '/sign-in', '/favicon.ico', '/_next', '/api/health'],
  redirectUrl: '/sign-in',
});

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};


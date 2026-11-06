import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { isHosted } from '@/lib/deployment-mode';
import { checkRateLimit, rateLimitResponse, rateLimitHeaders } from '@/lib/rateLimit';

const isProtectedRoute = createRouteMatcher(['/dashboard(.*)']);

// API routes covered by the shared `default` rate-limit tier. Excluded:
//   - /api/mcp*      — governed by the stricter/public `mcp` tier in its own route
//   - /api/insights* and /api/ai* — governed by the low `ai` tier in their handlers
//   - /api/cron*     — already bearer-token guarded, machine-to-machine
const isDefaultRateLimited = createRouteMatcher(['/api/(.*)']);
const isRateLimitExempt = createRouteMatcher([
  '/api/mcp(.*)',
  '/api/insights(.*)',
  '/api/ai(.*)',
  '/api/cron(.*)',
]);

// Only wraps the request in Clerk's middleware when running in hosted mode —
// in selfhost mode every request passes through untouched, so /dashboard is
// open directly with no login (and nothing is rate limited).
const hostedProxy = clerkMiddleware(async (auth, req) => {
  // Rate-limited API routes are never under /dashboard, so handle them and return.
  if (isDefaultRateLimited(req) && !isRateLimitExempt(req)) {
    const { userId } = await auth();
    const result = await checkRateLimit(req, 'default', { userId });
    if (!result.ok) return rateLimitResponse(result);
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(rateLimitHeaders(result))) res.headers.set(k, v);
    return res;
  }

  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  if (!isHosted()) {
    return NextResponse.next();
  }
  return hostedProxy(req, event);
}

// Clerk's middleware only runs where auth matters. Public marketing pages ('/',
// /privacy, /terms, /status) are deliberately excluded: on a Clerk dev instance
// the middleware bounces first-time visitors through a handshake redirect
// (~1.6 s of wasted navigation), and those pages need no session.
export const config = {
  matcher: [
    '/dashboard/:path*',
    '/api/:path*',
    '/trpc/:path*',
    '/__clerk/:path*',
  ],
};

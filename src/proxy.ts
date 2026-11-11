import { NextResponse, type NextFetchEvent, type NextRequest } from 'next/server';
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { isHosted } from '@/lib/deployment-mode';
import { isCrossSiteWrite } from '@/lib/security/csrf';
import { checkPatRequest } from '@/lib/tokens/pat';
import { checkRateLimit, rateLimitResponse, rateLimitHeaders } from '@/lib/rateLimit';

// App pages live at the top level (see src/lib/routes.ts); keep this list in sync (a test enforces it).
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/portfolio(.*)',
  '/markets(.*)',
  '/screener(.*)',
  '/ipos(.*)',
  '/news(.*)',
  '/research(.*)',
  '/agents(.*)',
  '/notes(.*)',
  '/alerts(.*)',
  '/mitra(.*)',
  '/mitra-activity(.*)',
  '/advisor(.*)',
  '/settings(.*)',
  '/system(.*)',
  '/stock(.*)',
  '/index(.*)',
  '/api-docs(.*)',
]);

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
// in selfhost mode every request passes through untouched, so the app pages are
// open directly with no login (and nothing is rate limited).
const hostedProxy = clerkMiddleware(async (auth, req) => {
  // Rate-limited API routes are never app pages, so handle them and return.
  if (isDefaultRateLimited(req) && !isRateLimitExempt(req)) {
    const { userId } = await auth();
    // A personal access token is rate limited per token (same tier), not per IP.
    const pat = patDecision(req);
    if (pat.kind === 'allow') {
      // Any well-formed token string gets its own bucket, so guard by IP first: random tokens must not
      // be a way around the limit or a free path to a database lookup per request.
      const ipResult = await checkRateLimit(req, 'default', { userId: null, ipAtAuthedRate: true });
      if (!ipResult.ok) return rateLimitResponse(ipResult);
    }
    const result = await checkRateLimit(req, 'default', { userId: pat.kind === 'allow' ? pat.rateKey : userId });
    if (!result.ok) return rateLimitResponse(result);
    const res = NextResponse.next();
    for (const [k, v] of Object.entries(rateLimitHeaders(result))) res.headers.set(k, v);
    return res;
  }

  if (isProtectedRoute(req)) {
    await auth.protect();
  }
});

const isMcpRoute = createRouteMatcher(['/api/mcp(.*)']);

function patDecision(req: NextRequest) {
  return checkPatRequest({
    method: req.method,
    path: req.nextUrl.pathname,
    authorization: req.headers.get('authorization'),
  });
}

export default function proxy(req: NextRequest, event: NextFetchEvent) {
  // CSRF: refuse state-changing API calls a browser makes from another site.
  // (MCP is anonymous and meant to be callable from any client, so it's exempt.)
  if (
    isDefaultRateLimited(req) &&
    !isMcpRoute(req) &&
    isCrossSiteWrite({
      method: req.method,
      origin: req.headers.get('origin'),
      host: req.headers.get('host'),
      secFetchSite: req.headers.get('sec-fetch-site'),
    })
  ) {
    return NextResponse.json({ success: false, error: 'Cross-site request blocked' }, { status: 403 });
  }

  if (!isHosted()) {
    return NextResponse.next();
  }
  // Personal access tokens (ADR 0053): cheap scope / path gate here; the database check is in getCurrentUserId.
  const pat = patDecision(req);
  if (pat.kind === 'deny') {
    return NextResponse.json({ success: false, error: pat.error }, { status: pat.status });
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
    '/portfolio/:path*',
    '/markets/:path*',
    '/screener/:path*',
    '/ipos/:path*',
    '/news/:path*',
    '/research/:path*',
    '/agents/:path*',
    '/notes/:path*',
    '/alerts/:path*',
    '/mitra/:path*',
    '/mitra-activity/:path*',
    '/advisor/:path*',
    '/settings/:path*',
    '/system/:path*',
    '/stock/:path*',
    '/index/:path*',
    '/api-docs/:path*',
    '/api/:path*',
    '/trpc/:path*',
    '/__clerk/:path*',
  ],
};

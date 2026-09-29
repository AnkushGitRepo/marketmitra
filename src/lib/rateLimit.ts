// Fair-use rate limiting for the hosted instance (Phase 9 Part 2, ADR 0019).
//
// Backed by Upstash Redis (`@upstash/ratelimit` sliding window). If no
// Upstash REST credentials are configured — i.e. every self-host
// deployment, and any hosted deployment before the integration is
// provisioned — this is a **no-op pass-through**. Self-host stays
// unthrottled and full-featured (ADR 0010).
//
// Env var names: the Vercel Upstash integration injects `KV_REST_API_URL` /
// `KV_REST_API_TOKEN`; a manual / self-host setup may use the Upstash-native
// `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`. Either works.
//
// Key: the Clerk user id when signed in, else the client IP. Tiers carry
// different budgets; the numbers here are a starting point, tuned against
// real traffic later (they intentionally live in code, not an ADR).

import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { getCurrentUserId } from '@/lib/currentUserId';

const REST_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

/** True when a limiter store is configured. When false, everything passes. */
export const rateLimitEnabled = Boolean(REST_URL && REST_TOKEN);

export type RateLimitTier = 'default' | 'ai' | 'mcp';

interface TierConfig {
  /** requests per window for a signed-in caller */
  authed: number;
  /** requests per window for an anonymous caller (by IP) */
  anon: number;
  /** sliding window */
  window: `${number} s` | `${number} m`;
}

// Starting budgets — deliberately generous for real dashboard use, tight
// for the token-spending AI routes and for anonymous callers.
const TIERS: Record<RateLimitTier, TierConfig> = {
  default: { authed: 120, anon: 30, window: '60 s' },
  ai: { authed: 15, anon: 6, window: '60 s' },
  mcp: { authed: 120, anon: 60, window: '60 s' },
};

export interface RateLimitResult {
  ok: boolean;
  limit: number;
  remaining: number;
  /** epoch ms when the window resets */
  reset: number;
}

const PASS: RateLimitResult = { ok: true, limit: 0, remaining: 0, reset: 0 };

let redis: Redis | null = null;
const limiters = new Map<string, Ratelimit>();

function getRedis(): Redis {
  redis ??= new Redis({ url: REST_URL!, token: REST_TOKEN! });
  return redis;
}

/** Live connectivity check for the system status page — a cheap round trip
 * against the same store the limiter uses. Throws if unreachable/misconfigured;
 * callers (src/lib/system/health.ts) are responsible for catching. */
export async function pingRedis(): Promise<void> {
  if (!rateLimitEnabled) throw new Error('Rate limiting is not configured');
  await getRedis().get('mm:health:ping');
}

function getLimiter(tier: RateLimitTier, authed: boolean): Ratelimit {
  const key = `${tier}:${authed ? 'authed' : 'anon'}`;
  const existing = limiters.get(key);
  if (existing) return existing;

  const cfg = TIERS[tier];
  const limit = authed ? cfg.authed : cfg.anon;
  const rl = new Ratelimit({
    redis: getRedis(),
    limiter: Ratelimit.slidingWindow(limit, cfg.window),
    prefix: `mm:rl:${key}`,
    analytics: false,
  });
  limiters.set(key, rl);
  return rl;
}

/** First hop of `x-forwarded-for`, or `x-real-ip`, else a fixed fallback. */
function clientIp(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown-ip';
}

/**
 * Check (and consume) one unit of the caller's budget for `tier`.
 * Returns `{ ok: true, ... }` unchanged when rate limiting is disabled.
 *
 * Pass `opts.userId` when the caller already has it (e.g. middleware, which
 * gets it from Clerk's callback); otherwise it is resolved here.
 * `opts.userId === null` means "known anonymous, skip the lookup".
 */
export async function checkRateLimit(
  req: Request,
  tier: RateLimitTier = 'default',
  opts: { userId?: string | null } = {}
): Promise<RateLimitResult> {
  if (!rateLimitEnabled) return PASS;

  let userId: string | null;
  if ('userId' in opts) {
    userId = opts.userId ?? null;
  } else {
    try {
      userId = await getCurrentUserId();
    } catch {
      userId = null;
    }
  }
  // `getCurrentUserId()` returns the literal 'local' only in self-host, where
  // `rateLimitEnabled` is already false — so here a value means a real user.
  const authed = Boolean(userId && userId !== 'local');
  const key = authed ? `u:${userId}` : `ip:${clientIp(req)}`;

  try {
    const r = await getLimiter(tier, authed).limit(key);
    return { ok: r.success, limit: r.limit, remaining: r.remaining, reset: r.reset };
  } catch {
    // A limiter/store failure must not take the endpoint down — fail open.
    return PASS;
  }
}

/** Standard headers to attach to any response covered by a limiter. */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  if (!r.limit) return {};
  return {
    'RateLimit-Limit': String(r.limit),
    'RateLimit-Remaining': String(Math.max(0, r.remaining)),
    'RateLimit-Reset': String(Math.max(0, Math.ceil((r.reset - Date.now()) / 1000))),
  };
}

/** The 429 body + headers for a rejected request. */
export function rateLimitResponse(r: RateLimitResult): Response {
  const retryAfter = Math.max(1, Math.ceil((r.reset - Date.now()) / 1000));
  return new Response(
    JSON.stringify({
      success: false,
      data: null,
      error: 'Rate limit exceeded. Slow down and try again shortly.',
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfter),
        ...rateLimitHeaders(r),
      },
    }
  );
}

type RouteHandler = (req: Request, ctx?: unknown) => Promise<Response> | Response;

/**
 * Wrap a route handler so every call first passes `tier`'s budget. On a
 * rejection it returns the 429 without invoking the handler; otherwise it
 * runs the handler and adds `RateLimit-*` headers to its response.
 */
export function withRateLimit(handler: RouteHandler, tier: RateLimitTier = 'default'): RouteHandler {
  return async (req, ctx) => {
    const r = await checkRateLimit(req, tier);
    if (!r.ok) return rateLimitResponse(r);
    const res = await handler(req, ctx);
    const extra = rateLimitHeaders(r);
    for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
    return res;
  };
}

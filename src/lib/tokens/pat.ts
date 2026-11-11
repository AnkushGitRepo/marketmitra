// Personal access tokens (ADR 0053): pure logic only — format, hashing, scope and path policy.
// Storage is in ./store.ts; the request-time wiring is in src/proxy.ts and src/lib/currentUserId.ts.

import { createHash } from 'node:crypto';
import { z } from 'zod';

export type TokenScope = 'read' | 'write';
export type ExpiryChoice = 'never' | '30d' | '90d' | '365d';

export const TOKEN_PREFIX = 'mm_pat_';
export const MAX_ACTIVE_TOKENS = 10;

const SCOPE_TAG: Readonly<Record<TokenScope, string>> = { read: 'r', write: 'w' };
const TOKEN_RE = /^mm_pat_([rw])_[A-Za-z0-9_-]{43}$/;
const DAY_MS = 86_400_000;
const EXPIRY_DAYS: Readonly<Record<Exclude<ExpiryChoice, 'never'>, number>> = { '30d': 30, '90d': 90, '365d': 365 };

/** `randomBytes` is injected so this stays pure; pass 32 bytes from a CSPRNG. */
export function generateToken(scope: TokenScope, randomBytes: Uint8Array): string {
  if (randomBytes.length < 32) throw new Error('Token entropy must be at least 32 bytes');
  const body = Buffer.from(randomBytes.slice(0, 32)).toString('base64url');
  return `${TOKEN_PREFIX}${SCOPE_TAG[scope]}_${body}`;
}

/** SHA-256 is enough here: tokens are 256-bit random, so there is nothing to brute-force. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** The scope is part of the hashed token, so it cannot be flipped without changing the hash. */
export function scopeOf(token: string): TokenScope | null {
  const m = TOKEN_RE.exec(token);
  if (!m) return null;
  return m[1] === 'r' ? 'read' : 'write';
}

/** A well-formed PAT from an `Authorization: Bearer …` header, else null. */
export function parseBearer(header: string | null): string | null {
  if (!header) return null;
  const m = /^bearer\s+(\S+)$/i.exec(header.trim());
  if (!m) return null;
  return TOKEN_RE.test(m[1]) ? m[1] : null;
}

export function scopeAllows(scope: TokenScope, method: string): boolean {
  if (scope === 'write') return true;
  return method === 'GET' || method === 'HEAD' || method === 'OPTIONS';
}

/** Never reachable with a token, whatever its scope. Mirrors Mitra's deny-list (ADR 0036) plus token management. */
const BLOCKED: readonly string[] = [
  '/api/settings', // stored AI key, channels, token management, account deletion, data export
  '/api/cron',
  '/api/advisor',
  '/api/system/logs',
];

/** Lower-cased, decoded, de-duplicated slashes, no trailing slash; null when it cannot be read safely. */
function normalizePath(path: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    return null;
  }
  // A '%' left after one decode means double encoding; refuse rather than guess.
  if (decoded.includes('%')) return null;
  const collapsed = decoded.toLowerCase().replace(/\/{2,}/g, '/');
  return collapsed.length > 1 ? collapsed.replace(/\/+$/, '') : collapsed;
}

/** Fails closed: a path that cannot be normalised is treated as blocked. */
export function isPatBlockedPath(path: string): boolean {
  const p = normalizePath(path);
  if (p === null) return true;
  return BLOCKED.some((b) => p === b || p.startsWith(`${b}/`));
}

export function expiryFor(choice: ExpiryChoice, now: Date): Date | null {
  if (choice === 'never') return null;
  return new Date(now.getTime() + EXPIRY_DAYS[choice] * DAY_MS);
}

export function isUsable(t: { revokedAt: Date | null; expiresAt: Date | null }, now: Date): boolean {
  if (t.revokedAt) return false;
  return t.expiresAt === null || t.expiresAt.getTime() > now.getTime();
}

export const createTokenSchema = z.object({
  name: z.string().trim().min(1).max(60),
  scope: z.enum(['read', 'write']),
  expiry: z.enum(['never', '30d', '90d', '365d']).default('90d'),
});
export type CreateTokenInput = z.infer<typeof createTokenSchema>;

export type PatDecision =
  | { kind: 'none' }
  | { kind: 'allow'; rateKey: string }
  | { kind: 'deny'; status: 403; error: string };

/** Cheap, database-free gate for the proxy. The database lookup (revoked / expired / owner) happens in getCurrentUserId. */
export function checkPatRequest(req: { method: string; path: string; authorization: string | null }): PatDecision {
  const token = parseBearer(req.authorization);
  if (!token) return { kind: 'none' };
  if (!req.path.startsWith('/api/')) {
    return { kind: 'deny', status: 403, error: 'Access tokens only work on /api endpoints' };
  }
  if (isPatBlockedPath(req.path)) {
    return { kind: 'deny', status: 403, error: 'This endpoint is not available to access tokens' };
  }
  const scope = scopeOf(token);
  if (!scope || !scopeAllows(scope, req.method)) {
    return { kind: 'deny', status: 403, error: 'This token is read-only' };
  }
  return { kind: 'allow', rateKey: `pat:${hashToken(token).slice(0, 16)}` };
}

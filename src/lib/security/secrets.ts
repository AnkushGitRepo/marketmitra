import { createHash, timingSafeEqual } from 'node:crypto';

/** Constant-time string comparison. Both sides are hashed first so inputs of
 * different lengths compare in the same time and never throw. */
export function secretsEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb) && a.length === b.length;
}

/** True when `header` is exactly `Bearer <secret>`. A plain `===` on a secret
 * leaks how many leading characters matched through response timing. An unset
 * or empty secret never matches. */
export function bearerMatches(header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || !header) return false;
  return secretsEqual(header, `Bearer ${secret}`);
}

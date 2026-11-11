// Plain-words labels for the token list in Settings.

import type { TokenScope } from './pat';
import type { TokenStatus } from './store';

const DAY_MS = 86_400_000;
const SOON_DAYS = 7;

const day = (d: Date) => d.toISOString().slice(0, 10);

export function expiryLabel(t: { expiresAt: Date | null; status: TokenStatus }, now: Date): string {
  if (t.status === 'revoked') return 'Revoked';
  if (!t.expiresAt) return 'Never expires';
  if (t.status === 'expired') return `Expired ${day(t.expiresAt)}`;
  const days = Math.ceil((t.expiresAt.getTime() - now.getTime()) / DAY_MS);
  return days <= SOON_DAYS ? `Expires in ${days} day${days === 1 ? '' : 's'} (${day(t.expiresAt)})` : `Expires ${day(t.expiresAt)}`;
}

export function lastUsedLabel(lastUsedAt: Date | null): string {
  return lastUsedAt ? `Last used ${day(lastUsedAt)}` : 'Never used';
}

export function scopeLabel(scope: TokenScope): string {
  return scope === 'read' ? 'Read only' : 'Read & write';
}

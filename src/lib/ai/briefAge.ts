// How old an AI brief is and when it stops being shown as current (#406). The clock is passed in so this tests without mocks.

import { timeAgo } from '@/lib/notes/vault';

const HOUR_MS = 60 * 60 * 1000;

/** A brief older than this is retired: its card asks for a fresh one instead of showing it. The IPO brief has no limit. */
export const BRIEF_MAX_AGE_MS = {
  /** The dashboard "AI Daily Brief". */
  portfolio: 24 * HOUR_MS,
  /** Mitra Market Pulse: a read of how the market is trading goes stale within a session. */
  market: 6 * HOUR_MS,
  /** Mitra news pulse. */
  news: 6 * HOUR_MS,
} as const;

export interface BriefAge {
  /** "3 hours ago"; null when the brief has no usable timestamp. */
  readonly label: string | null;
  readonly expired: boolean;
}

export function briefAge(generatedAt: string | null, now: Date, maxAgeMs: number | null): BriefAge {
  const then = generatedAt ? new Date(generatedAt) : null;
  if (!then || Number.isNaN(then.getTime())) return { label: null, expired: false };
  // A timestamp a little ahead of this clock is skew, not the future.
  const age = Math.max(0, now.getTime() - then.getTime());
  return { label: timeAgo(then, new Date(then.getTime() + age)), expired: maxAgeMs !== null && age >= maxAgeMs };
}

// What happens to an analyst when the sweep hits an unexpected exception (#148). A one-off failure (a provider blip, a database hiccup, a key that
// could not be read) is retried a few times by the next sweeps instead of stranding the analyst for good. Pure.

import type { AnalystStatus } from './types';

export const MAX_AUTO_RETRIES = 3;

/** The note the old sweep wrote on any exception. Analysts left with it (and no dossier) are retried too. */
export const LEGACY_UNEXPECTED_NOTE = 'The analyst hit an unexpected error';
export const FINAL_ERROR_NOTE = 'The analyst hit an unexpected error several times in a row. Retry it, or check your AI key in Settings.';

export interface FailureState {
  status: Extract<AnalystStatus, 'initializing' | 'error'>;
  note: string;
  /** The retry count to store. */
  retryCount: number;
}

/** The state after one more unexpected failure: back in the queue while attempts remain, stalled once they are used up. */
export function afterFailure(previousRetries: number): FailureState {
  const retryCount = Math.max(0, previousRetries) + 1;
  return retryCount < MAX_AUTO_RETRIES
    ? { status: 'initializing', note: `Retrying after a temporary error (attempt ${retryCount + 1} of ${MAX_AUTO_RETRIES}).`, retryCount }
    : { status: 'error', note: FINAL_ERROR_NOTE, retryCount };
}

export interface RetryCandidate {
  status: AnalystStatus;
  hasDossier: boolean;
  statusNote: string | null;
  retryCount: number;
}

/**
 * Whether the sweep should put a stalled analyst back in the queue by itself: it has no dossier, it stalled on an unexpected exception (not a
 * provider or data error, which need the user), and it has attempts left.
 */
export function isAutoRetryable(a: RetryCandidate): boolean {
  return a.status === 'error' && !a.hasDossier && (a.statusNote ?? '').startsWith(LEGACY_UNEXPECTED_NOTE) && a.retryCount < MAX_AUTO_RETRIES;
}

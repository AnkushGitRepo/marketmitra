import { describe, expect, it } from 'vitest';
import { FINAL_ERROR_NOTE, MAX_AUTO_RETRIES, afterFailure, isAutoRetryable } from './retry';

describe('afterFailure', () => {
  it('puts the analyst back in the queue while attempts remain, saying so', () => {
    expect(afterFailure(0)).toEqual({ status: 'initializing', note: 'Retrying after a temporary error (attempt 2 of 3).', retryCount: 1 });
    expect(afterFailure(1)).toMatchObject({ status: 'initializing', retryCount: 2, note: 'Retrying after a temporary error (attempt 3 of 3).' });
  });
  it('stalls it with a clear note once the attempts are used up', () => {
    expect(afterFailure(MAX_AUTO_RETRIES - 1)).toEqual({ status: 'error', note: FINAL_ERROR_NOTE, retryCount: MAX_AUTO_RETRIES });
    expect(afterFailure(10).status).toBe('error');
  });
  it('treats a negative stored count as zero', () => {
    expect(afterFailure(-5).retryCount).toBe(1);
  });
});

describe('isAutoRetryable', () => {
  const stalled = { status: 'error' as const, hasDossier: false, statusNote: 'The analyst hit an unexpected error. Resume it to try again.', retryCount: 0 };
  it('retries an analyst stalled by an unexpected exception, including the note the old sweep wrote', () => {
    expect(isAutoRetryable(stalled)).toBe(true);
    expect(isAutoRetryable({ ...stalled, retryCount: 2 })).toBe(true);
  });
  it('leaves provider or data errors, built analysts, other states and used-up attempts alone', () => {
    expect(isAutoRetryable({ ...stalled, statusNote: 'The AI provider returned an error: quota' })).toBe(false);
    expect(isAutoRetryable({ ...stalled, statusNote: 'Could not load data for this symbol.' })).toBe(false);
    expect(isAutoRetryable({ ...stalled, hasDossier: true })).toBe(false);
    expect(isAutoRetryable({ ...stalled, status: 'active' })).toBe(false);
    expect(isAutoRetryable({ ...stalled, retryCount: 3 })).toBe(false);
    expect(isAutoRetryable({ ...stalled, statusNote: null })).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';
import { HttpError, RetryAbortedError, fetchJsonWithTimeout, isRetryableError, retryWithBackoff } from './retry';

const noSleep: (ms: number) => Promise<void> = () => Promise.resolve();

describe('retryWithBackoff', () => {
  it('returns the first success without waiting', async () => {
    const sleep = vi.fn(noSleep);
    expect(await retryWithBackoff(async () => 'ok', { attempts: 3, delaysMs: [100], sleep })).toBe('ok');
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries with the configured back-off, then succeeds', async () => {
    const sleep = vi.fn(noSleep);
    const fn = vi.fn().mockRejectedValueOnce(new Error('a')).mockRejectedValueOnce(new Error('b')).mockResolvedValueOnce('done');
    expect(await retryWithBackoff(fn, { attempts: 4, delaysMs: [10, 50], sleep })).toBe('done');
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([10, 50]);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(fn.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
  });

  it('repeats the last delay when attempts outnumber delays, and throws the last error when exhausted', async () => {
    const sleep = vi.fn(noSleep);
    const fn = vi.fn().mockRejectedValue(new Error('still down'));
    await expect(retryWithBackoff(fn, { attempts: 4, delaysMs: [5, 7], sleep })).rejects.toThrow('still down');
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([5, 7, 7]);
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('stops at once when shouldRetry says the error is permanent', async () => {
    const fn = vi.fn().mockRejectedValue(new HttpError(404));
    await expect(retryWithBackoff(fn, { attempts: 5, delaysMs: [1], sleep: noSleep, shouldRetry: isRetryableError })).rejects.toBeInstanceOf(HttpError);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    const fn = vi.fn(async () => {
      controller.abort();
      throw new Error('x');
    });
    await expect(retryWithBackoff(fn, { attempts: 5, delaysMs: [1], sleep: noSleep, signal: controller.signal })).rejects.toBeInstanceOf(RetryAbortedError);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});

describe('isRetryableError', () => {
  it('retries server errors, timeouts, rate limits and network failures, but not other client errors', () => {
    for (const s of [500, 502, 503, 408, 429]) expect(isRetryableError(new HttpError(s)), String(s)).toBe(true);
    for (const s of [400, 401, 403, 404, 422]) expect(isRetryableError(new HttpError(s)), String(s)).toBe(false);
    expect(isRetryableError(new TypeError('Failed to fetch'))).toBe(true);
  });
});

describe('fetchJsonWithTimeout', () => {
  it('parses a successful JSON response', async () => {
    const f = vi.fn(async () => new Response(JSON.stringify({ a: 1 }), { status: 200 }));
    expect(await fetchJsonWithTimeout('/x', 1000, f as unknown as typeof fetch)).toEqual({ a: 1 });
  });

  it('throws HttpError with the status for non-2xx', async () => {
    const f = vi.fn(async () => new Response('no', { status: 503 }));
    await expect(fetchJsonWithTimeout('/x', 1000, f as unknown as typeof fetch)).rejects.toMatchObject({ status: 503 });
  });

  it('aborts a request that exceeds the timeout', async () => {
    const f = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_res, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')))));
    await expect(fetchJsonWithTimeout('/x', 20, f as unknown as typeof fetch)).rejects.toMatchObject({ name: 'AbortError' });
  });
});

// Small, dependency-free retry + timeout helpers for client-side data recovery (chart fail-safe, #64).

export interface RetryOptions {
  /** Total tries, including the first. */
  readonly attempts: number;
  /** Wait before try 2, 3, …; the last value repeats if there are more attempts than delays. */
  readonly delaysMs: readonly number[];
  /** Return false to stop retrying immediately (e.g. a 404). Defaults to always retry. */
  readonly shouldRetry?: (error: unknown) => boolean;
  /** Injected in tests so no real time passes. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly signal?: AbortSignal;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RetryAbortedError extends Error {
  constructor() {
    super('Retry aborted');
    this.name = 'RetryAbortedError';
  }
}

/** Runs `fn` until it succeeds, attempts run out, `shouldRetry` says stop, or the signal aborts. Throws the last error. */
export async function retryWithBackoff<T>(fn: (attempt: number) => Promise<T>, options: RetryOptions): Promise<T> {
  const { attempts, delaysMs, shouldRetry = () => true, sleep = defaultSleep, signal } = options;
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    if (signal?.aborted) throw new RetryAbortedError();
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !shouldRetry(error)) break;
      const wait = delaysMs[Math.min(attempt - 1, delaysMs.length - 1)] ?? 0;
      await sleep(wait);
    }
  }
  throw lastError;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message?: string
  ) {
    super(message ?? `HTTP ${status}`);
    this.name = 'HttpError';
  }
}

/** Client errors (except timeouts and rate limits) will not fix themselves, so retrying them only wastes time. */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof HttpError) return error.status >= 500 || error.status === 408 || error.status === 429;
  return true; // network failure, timeout, parse error
}

/** GET JSON with a hard timeout. Throws HttpError for non-2xx so callers can classify it. */
export async function fetchJsonWithTimeout<T>(url: string, timeoutMs: number, fetchImpl: typeof fetch = fetch): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal, headers: { accept: 'application/json' } });
    if (!res.ok) throw new HttpError(res.status);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

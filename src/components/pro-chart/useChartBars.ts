'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toBars, type Bar } from '@/lib/chart/bars';
import type { PricePointOut } from '@/lib/dashboard/fundamentalsApi';
import { fetchJsonWithTimeout, isRetryableError, retryWithBackoff } from '@/lib/net/retry';

export type ChartDataStatus = 'ready' | 'loading' | 'error';

const REQUEST_TIMEOUT_MS = 12_000;
const ATTEMPTS = 4;
const BACKOFF_MS = [1_000, 3_000, 7_000];

interface PricesResponse {
  readonly success: boolean;
  readonly data?: { readonly bars: Bar[] } | null;
}

/**
 * Price-history recovery for the stock chart (#64). The server renders the first load; if it came back empty
 * (upstream hiccup) this fetches the bars itself with a timeout and back-off instead of leaving the chart blank,
 * and exposes `retry` for a manual second chance.
 */
export function useChartBars(symbol: string, initialBars: Bar[]): { bars: Bar[]; status: ChartDataStatus; retry: () => void } {
  const [bars, setBars] = useState<Bar[]>(initialBars);
  const [status, setStatus] = useState<ChartDataStatus>(initialBars.length > 0 ? 'ready' : 'loading');
  const [attemptId, setAttemptId] = useState(0);
  const skipInitial = useRef(initialBars.length > 0);

  useEffect(() => {
    if (skipInitial.current && attemptId === 0) return; // server data is good: nothing to recover
    const controller = new AbortController();
    let alive = true;

    retryWithBackoff(
      async () => {
        const body = await fetchJsonWithTimeout<PricesResponse>(`/api/stock/${encodeURIComponent(symbol)}/prices?period=5y`, REQUEST_TIMEOUT_MS);
        const next = body.data?.bars ?? [];
        if (!body.success || next.length === 0) throw new Error('no price history');
        return next;
      },
      { attempts: ATTEMPTS, delaysMs: BACKOFF_MS, shouldRetry: isRetryableError, signal: controller.signal }
    )
      .then((next) => {
        if (!alive) return;
        setBars(next);
        setStatus('ready');
      })
      .catch(() => {
        if (alive) setStatus('error');
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [symbol, attemptId]);

  const retry = useCallback(() => {
    setStatus('loading');
    setAttemptId((n) => n + 1);
  }, []);

  return { bars, status, retry };
}

/** Exposed for tests: the same conversion the server uses, for API rows that arrive un-barred. */
export const barsFromPoints = (points: PricePointOut[]): Bar[] => toBars(points);

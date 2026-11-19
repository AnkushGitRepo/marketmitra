'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { mergeBars, type Bar } from '@/lib/chart/bars';
import { isMarketOpen, pollIntervalMs, type Timeframe } from '@/lib/chart/timeframes';
import { fetchJsonWithTimeout } from '@/lib/net/retry';

export type CandlesStatus = 'ready' | 'loading' | 'error';

interface CandlesResponse {
  readonly success: boolean;
  readonly data?: { readonly bars: Bar[]; readonly pollMs: number } | null;
}

/** What the hook has fetched for one symbol and timeframe. For Day it only holds the polled tail (merged over the page's history). */
interface Store {
  key: string;
  bars: Bar[];
  status: CandlesStatus;
}

const REQUEST_TIMEOUT_MS = 12_000;
const TAIL_BARS = 3;

const candlesUrl = (symbol: string, timeframe: Timeframe, last?: number) =>
  `/api/stock/${encodeURIComponent(symbol)}/candles?interval=${timeframe}${last ? `&last=${last}` : ''}`;

interface UseCandlesResult {
  bars: Bar[];
  status: CandlesStatus;
  retry: () => void;
  /** True while the poll is running (market open, tab visible); drives the "Live" dot. */
  live: boolean;
}

/**
 * The bars for the chart's timeframe, kept current (#236, ADR 0069). Day starts from the server-rendered history; every other
 * timeframe loads its own window. While the market is open and the tab is visible, the newest bars are polled at the cadence
 * the server names (it differs between the hosted site and a local install) and merged in; a tick with nothing new leaves the
 * array untouched so the chart does not redraw.
 */
export function useCandles(
  symbol: string,
  timeframe: Timeframe,
  dailyBars: Bar[],
): UseCandlesResult {
  const key = `${symbol}|${timeframe}`;
  const isDay = timeframe === '1d';
  const [store, setStore] = useState<Store>({ key, bars: [], status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const [live, setLive] = useState(false);
  const pollMs = useRef(pollIntervalMs(timeframe, true));

  // What the caller sees is derived, so switching symbol or timeframe never shows the previous one's bars.
  const held = store.key === key ? store : null;
  const bars = useMemo(() => {
    if (!isDay) return held ? held.bars : [];
    return held && held.bars.length > 0 ? mergeBars(dailyBars, held.bars) : dailyBars;
  }, [isDay, held, dailyBars]);
  const status: CandlesStatus = isDay
    ? bars.length > 0
      ? 'ready'
      : 'loading'
    : (held?.status ?? 'loading');

  // Intraday: load the window for this timeframe. (Day keeps the history the page already has.)
  useEffect(() => {
    if (isDay) return;
    let cancelled = false;
    fetchJsonWithTimeout<CandlesResponse>(candlesUrl(symbol, timeframe), REQUEST_TIMEOUT_MS)
      .then((body) => {
        const next = body.data?.bars ?? [];
        if (!body.success || next.length === 0) throw new Error('no candles');
        pollMs.current = body.data?.pollMs ?? pollMs.current;
        if (!cancelled) setStore({ key, bars: next, status: 'ready' });
      })
      .catch(() => {
        if (!cancelled) setStore({ key, bars: [], status: 'error' });
      });
    return () => {
      cancelled = true;
    };
  }, [isDay, symbol, timeframe, key, attempt]);

  // Poll the tail while it can change.
  const ready = status === 'ready';
  useEffect(() => {
    if (!ready) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const active = () => document.visibilityState === 'visible' && isMarketOpen(new Date());
    const tick = async () => {
      if (stopped) return;
      if (active()) {
        setLive(true);
        try {
          const body = await fetchJsonWithTimeout<CandlesResponse>(
            candlesUrl(symbol, timeframe, TAIL_BARS),
            REQUEST_TIMEOUT_MS,
          );
          const tail = body.data?.bars;
          if (!stopped && body.success && tail) {
            pollMs.current = body.data?.pollMs ?? pollMs.current;
            setStore((cur) => {
              const base = cur.key === key ? cur.bars : [];
              const merged = mergeBars(base, tail);
              return cur.key === key && merged === cur.bars
                ? cur
                : { key, bars: merged, status: 'ready' };
            });
          }
        } catch {
          // A missed tick is harmless: the next one catches up.
        }
      } else {
        setLive(false);
      }
      if (!stopped) timer = setTimeout(tick, pollMs.current);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        if (timer) clearTimeout(timer);
        void tick();
      }
    };

    timer = setTimeout(tick, pollMs.current);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ready, symbol, timeframe, key]);

  const retry = useCallback(() => {
    setStore({ key, bars: [], status: 'loading' });
    setAttempt((n) => n + 1);
  }, [key]);

  return { bars, status, retry, live: live && ready };
}

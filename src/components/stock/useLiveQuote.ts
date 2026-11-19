'use client';

import { useEffect, useRef, useState } from 'react';
import { isMarketOpen } from '@/lib/chart/timeframes';
import { fetchJsonWithTimeout } from '@/lib/net/retry';

export interface LiveQuote {
  price: number;
  prevClose: number | null;
}

interface LiveResponse {
  readonly success: boolean;
  readonly data?: {
    readonly price: number;
    readonly prevClose: number | null;
    readonly pollMs: number;
  } | null;
}

const REQUEST_TIMEOUT_MS = 12_000;
/** Until the server names a cadence (it differs between the hosted site and a local install). */
const FIRST_POLL_MS = 15_000;

/**
 * The stock header's price, refreshed while the market is open and the tab is visible (#236, ADR 0069). Null until the first
 * answer, so the server-rendered price shows meanwhile; a failed poll just keeps the last value.
 */
export function useLiveQuote(symbol: string): LiveQuote | null {
  const [quote, setQuote] = useState<LiveQuote | null>(null);
  const pollMs = useRef(FIRST_POLL_MS);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;

    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === 'visible' && isMarketOpen(new Date())) {
        try {
          const body = await fetchJsonWithTimeout<LiveResponse>(
            `/api/stock/${encodeURIComponent(symbol)}/live`,
            REQUEST_TIMEOUT_MS,
          );
          if (!stopped && body.success && body.data) {
            pollMs.current = body.data.pollMs;
            const next = { price: body.data.price, prevClose: body.data.prevClose };
            setQuote((cur) =>
              cur && cur.price === next.price && cur.prevClose === next.prevClose ? cur : next,
            );
          }
        } catch {
          // keep the last value
        }
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
  }, [symbol]);

  return quote;
}

// Intraday and live-daily candles via yahoo-finance2 `chart()` (#236, ADR 0069). Server-only, like ./yahooQuote.ts.
// Two per-process caches share Yahoo calls between everyone watching the same symbol: the full history (slow-changing)
// and a small tail (polled), each with an in-flight guard, so N viewers cost one upstream call per window.

import YahooFinance from 'yahoo-finance2';
import { isHosted } from '@/lib/deployment-mode';
import type { Bar } from '@/lib/chart/bars';
import {
  isIntraday,
  pollIntervalMs,
  timeframeDef,
  toBarTime,
  type Timeframe,
} from '@/lib/chart/timeframes';
import { createTtlCache, type TtlCache } from '@/lib/markets/ttlCache';

declare global {
  var _yahooCandlesClient: InstanceType<typeof YahooFinance> | undefined;
}
const yahooFinance = global._yahooCandlesClient ?? new YahooFinance();
if (process.env.NODE_ENV !== 'production') global._yahooCandlesClient = yahooFinance;

interface ChartRow {
  date: Date;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  volume: number | null;
}

/** NSE bars longer than 15 minutes start at :15 IST (09:15, 10:15, ...), which is :45 in UTC; the half-hourly ones at :15 and :45 IST, which is :45 and :15 UTC. */
const BAR_OFFSET_S: Partial<Record<Timeframe, number>> = { '30m': 15 * 60, '1h': 45 * 60 };

/** Yahoo stamps the still-forming last bar with the time of the last trade, not the bar start; snap it back so the next poll replaces it. */
function alignToBar(epochSeconds: number, timeframe: Timeframe): number {
  const { seconds } = timeframeDef(timeframe);
  const offset = BAR_OFFSET_S[timeframe] ?? 0;
  return Math.floor((epochSeconds - offset) / seconds) * seconds + offset;
}

/** Yahoo rows to bars: oldest first, complete rows only, one bar per time (a later row replaces an earlier one). */
export function toCandleBars(rows: readonly ChartRow[], timeframe: Timeframe): Bar[] {
  const byTime = new Map<string, Bar>();
  for (const r of rows) {
    if (r.open == null || r.high == null || r.low == null || r.close == null) continue;
    const time = !isIntraday(timeframe)
      ? r.date.toISOString().slice(0, 10)
      : toBarTime(alignToBar(r.date.getTime() / 1000, timeframe));
    byTime.set(time, {
      time,
      open: r.open,
      high: r.high,
      low: r.low,
      close: r.close,
      volume: r.volume ?? 0,
    });
  }
  return [...byTime.values()].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** NSE SME shares trade under their series on Yahoo (`SYMBOL-SM.NS`); the plain ticker is mostly empty (see yahooQuote.ts). */
const SME_SERIES = ['SM', 'ST'] as const;
const HISTORY_TTL_HOSTED_MS = 60_000;
const HISTORY_TTL_LOCAL_MS = 5_000;
const TAIL_TTL_LOCAL_MS = 2_000;
const TAIL_BARS_MARGIN = 2;
const MIN_TAIL_BARS = 6;

async function fetchRows(
  yahooSymbol: string,
  timeframe: Timeframe,
  since: Date,
): Promise<ChartRow[]> {
  const result = (await yahooFinance.chart(
    yahooSymbol,
    { period1: since, interval: timeframeDef(timeframe).interval },
    { validateResult: false },
  )) as { quotes?: ChartRow[] };
  return result.quotes ?? [];
}

async function fetchBars(symbol: string, timeframe: Timeframe, since: Date): Promise<Bar[]> {
  const key = symbol.trim().toUpperCase();
  const plain = toCandleBars(await fetchRows(`${key}.NS`, timeframe, since), timeframe);
  if (plain.length > 0) return plain;
  for (const series of SME_SERIES) {
    const bars = toCandleBars(
      await fetchRows(`${key}-${series}.NS`, timeframe, since).catch(() => []),
      timeframe,
    );
    if (bars.length > 0) return bars;
  }
  return [];
}

const caches = new Map<string, TtlCache<Bar[]>>();
function cacheFor(kind: 'history' | 'tail', timeframe: Timeframe): TtlCache<Bar[]> {
  const hosted = isHosted();
  const key = `${kind}:${timeframe}:${hosted}`;
  let cache = caches.get(key);
  if (!cache) {
    const ttl =
      kind === 'history'
        ? hosted
          ? HISTORY_TTL_HOSTED_MS
          : HISTORY_TTL_LOCAL_MS
        : hosted
          ? pollIntervalMs(timeframe, true) / 2
          : TAIL_TTL_LOCAL_MS;
    cache = createTtlCache<Bar[]>(ttl);
    caches.set(key, cache);
  }
  return cache;
}

/**
 * Candles for a symbol. Without `last`: the timeframe's whole lookback window. With `last`: only the most recent `last` bars,
 * from a small, short-cached request, for the live poll. Throws when Yahoo fails (the route answers 502); returns [] when it
 * answers with nothing.
 */
export async function getCandles(
  symbol: string,
  timeframe: Timeframe,
  last?: number,
): Promise<Bar[]> {
  const def = timeframeDef(timeframe);
  const key = symbol.trim().toUpperCase();
  if (last === undefined) {
    return cacheFor('history', timeframe).get(key, () =>
      fetchBars(key, timeframe, new Date(Date.now() - def.lookbackDays * DAY_MS)),
    );
  }
  // Only the newest bars matter to the poll, so the window is a handful of bars wide (empty overnight and at weekends, which is
  // right: nothing changed). A daily tail needs a few days so the previous session is included.
  const windowMs = isIntraday(timeframe)
    ? Math.max(last + TAIL_BARS_MARGIN, MIN_TAIL_BARS) * def.seconds * 1000
    : Math.max(5, (last + TAIL_BARS_MARGIN) * (def.seconds / 86_400)) * DAY_MS;
  const bars = await cacheFor('tail', timeframe).get(key, () =>
    fetchBars(key, timeframe, new Date(Date.now() - windowMs)),
  );
  return bars.slice(-last);
}

// Chart timeframes (#236, ADR 0069): what each one asks Yahoo for, how often the live candle is polled, and how bar times are
// represented. Daily bars keep their `YYYY-MM-DD` time. Intraday bars use the epoch seconds of the bar's start shifted to IST
// wall-clock, as a decimal string, because lightweight-charts draws UTC and the market runs on Indian time. Everything that
// only compares or looks bars up by `time` keeps working unchanged; anything that reads a time as a date goes through the
// helpers below. Pure.

import type { Bar } from './bars';

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '1d' | '1w' | '1mo';

export interface TimeframeDef {
  id: Timeframe;
  label: string;
  /** yahoo-finance2 `interval`. */
  interval: '1m' | '5m' | '15m' | '30m' | '60m' | '1d' | '1wk' | '1mo';
  /** How far back the first load goes. Yahoo's own limits: 1m about 7 days, 5m, 15m and 30m about 60, 60m about 730. */
  lookbackDays: number;
  /** Poll cadence on the hosted site, in ms. */
  hostedPollMs: number;
  /** Bar length in seconds. */
  seconds: number;
  /** How long an Auto-Chart answer stays fresh, in ms. */
  overlayTtlMs: number;
  /** Auto-Chart: how far a planned entry (a limit at a level) may sit from the last close, and how wide a stop may be, in percent. */
  maxEntryDistancePct: number;
  maxStopDistancePct: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const TIMEFRAMES: readonly TimeframeDef[] = [
  {
    id: '1m',
    label: '1m',
    interval: '1m',
    lookbackDays: 5,
    hostedPollMs: 10_000,
    seconds: 60,
    overlayTtlMs: 2 * MINUTE,
    maxEntryDistancePct: 0.6,
    maxStopDistancePct: 2,
  },
  {
    id: '5m',
    label: '5m',
    interval: '5m',
    lookbackDays: 30,
    hostedPollMs: 30_000,
    seconds: 300,
    overlayTtlMs: 5 * MINUTE,
    maxEntryDistancePct: 1.2,
    maxStopDistancePct: 4,
  },
  {
    id: '15m',
    label: '15m',
    interval: '15m',
    lookbackDays: 55,
    hostedPollMs: 60_000,
    seconds: 900,
    overlayTtlMs: 10 * MINUTE,
    maxEntryDistancePct: 2,
    maxStopDistancePct: 6,
  },
  {
    id: '30m',
    label: '30m',
    interval: '30m',
    lookbackDays: 55,
    hostedPollMs: 90_000,
    seconds: 1800,
    overlayTtlMs: 20 * MINUTE,
    maxEntryDistancePct: 3,
    maxStopDistancePct: 8,
  },
  {
    id: '1h',
    label: '1h',
    interval: '60m',
    lookbackDays: 360,
    hostedPollMs: 120_000,
    seconds: 3600,
    overlayTtlMs: 30 * MINUTE,
    maxEntryDistancePct: 4,
    maxStopDistancePct: 12,
  },
  {
    id: '1d',
    label: 'D',
    interval: '1d',
    lookbackDays: 366,
    hostedPollMs: 30_000,
    seconds: 86_400,
    overlayTtlMs: 12 * HOUR,
    maxEntryDistancePct: 8,
    maxStopDistancePct: 25,
  },
  {
    id: '1w',
    label: 'W',
    interval: '1wk',
    lookbackDays: 3650,
    hostedPollMs: 120_000,
    seconds: 7 * 86_400,
    overlayTtlMs: 24 * HOUR,
    maxEntryDistancePct: 12,
    maxStopDistancePct: 35,
  },
  {
    id: '1mo',
    label: 'M',
    interval: '1mo',
    lookbackDays: 7300,
    hostedPollMs: 300_000,
    seconds: 30 * 86_400,
    overlayTtlMs: 24 * HOUR,
    maxEntryDistancePct: 20,
    maxStopDistancePct: 50,
  },
];

export const DEFAULT_TIMEFRAME: Timeframe = '1d';

/** How many recent bars the chart shows when a timeframe is first opened (roughly a session or two). */
export const INTRADAY_VISIBLE_BARS: Record<Timeframe, number> = {
  '1m': 180,
  '5m': 150,
  '15m': 120,
  '30m': 120,
  '1h': 100,
  '1d': 0,
  '1w': 0,
  '1mo': 0,
};

export function timeframeDef(id: Timeframe): TimeframeDef {
  return TIMEFRAMES.find((t) => t.id === id) ?? TIMEFRAMES.find((t) => t.id === DEFAULT_TIMEFRAME)!;
}

export function isTimeframe(value: unknown): value is Timeframe {
  return TIMEFRAMES.some((t) => t.id === value);
}

/** True for the minute and hour timeframes, whose bars carry a time of day. Day, week and month bars are keyed by their date. */
export function isIntraday(id: Timeframe): boolean {
  return id !== '1d' && id !== '1w' && id !== '1mo';
}

const LOCAL_FLOOR_MS = 5_000;

/** Poll cadence: the hosted figure as is; a local install (one user, no shared quota) polls twice as fast, never under 5 s. */
export function pollIntervalMs(id: Timeframe, hosted: boolean): number {
  const hostedMs = timeframeDef(id).hostedPollMs;
  return hosted ? hostedMs : Math.max(LOCAL_FLOOR_MS, hostedMs / 2);
}

// ---- bar times ----

const IST_OFFSET_S = 19_800;
const INTRADAY_TIME = /^\d{9,}$/;
const INTRADAY_LABEL = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/;
const DAILY_LABEL = /^\d{4}-\d{2}-\d{2}$/;

/** Epoch seconds (UTC) of a bar's start to the chart's time string. */
export function toBarTime(epochSeconds: number): string {
  return String(Math.round(epochSeconds) + IST_OFFSET_S);
}

export function isIntradayTime(time: string): boolean {
  return INTRADAY_TIME.test(time);
}

/** A bar time on one millisecond scale, for ordering and distance. Intraday times are already IST wall-clock. */
export function barTimeMs(time: string): number {
  return isIntradayTime(time) ? Number(time) * 1000 : Date.parse(time);
}

const pad = (n: number) => String(n).padStart(2, '0');

/** `2026-11-18 09:15` (IST) for an intraday bar, the date itself for a daily one. */
export function barTimeLabel(time: string): string {
  if (!isIntradayTime(time)) return time;
  const d = new Date(Number(time) * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** The inverse of `barTimeLabel`; null when the text is neither shape. */
export function parseBarTimeLabel(label: string): string | null {
  const text = label.trim();
  const m = INTRADAY_LABEL.exec(text);
  if (m) {
    const [, y, mo, d, h, mi] = m.map(Number);
    return String(Date.UTC(y, mo - 1, d, h, mi) / 1000);
  }
  return DAILY_LABEL.test(text) ? text : null;
}

// ---- intraday ranges ----

/** The bottom-bar choices on an intraday chart: the last N trading days, or everything loaded. */
export type IntradayRange = '1D' | '5D' | '1M' | 'ALL';
export const INTRADAY_RANGES: readonly IntradayRange[] = ['1D', '5D', '1M', 'ALL'];
const RANGE_TRADING_DAYS: Record<Exclude<IntradayRange, 'ALL'>, number> = {
  '1D': 1,
  '5D': 5,
  '1M': 21,
};

/** First bar index of each trading day, oldest first. */
function dayStarts(bars: readonly Bar[]): number[] {
  const starts: number[] = [];
  let day = '';
  bars.forEach((b, i) => {
    const d = barTimeLabel(b.time).slice(0, 10);
    if (d !== day) {
      day = d;
      starts.push(i);
    }
  });
  return starts;
}

/** Index of the first bar to show for the range (0 when the data is shorter than the range). */
export function intradayRangeStart(bars: readonly Bar[], range: IntradayRange): number {
  if (range === 'ALL') return 0;
  const starts = dayStarts(bars);
  return starts[Math.max(0, starts.length - RANGE_TRADING_DAYS[range])] ?? 0;
}

/** Whether the loaded data holds enough trading days to show the range as asked. */
export function intradayRangeAvailable(bars: readonly Bar[], range: IntradayRange): boolean {
  if (bars.length === 0) return false;
  return range === 'ALL' || dayStarts(bars).length >= RANGE_TRADING_DAYS[range];
}

// ---- market hours ----

const OPEN_MINUTE = 9 * 60 + 15;
const CLOSE_MINUTE = 15 * 60 + 30;

/** Weekday 09:15 to 15:30 IST. Exchange holidays are not known here, so on a holiday this reads open and the data simply does not move. */
export function isMarketOpen(now: Date): boolean {
  const ist = new Date(now.getTime() + IST_OFFSET_S * 1000);
  const day = ist.getUTCDay();
  if (day === 0 || day === 6) return false;
  const minute = ist.getUTCHours() * 60 + ist.getUTCMinutes();
  return minute >= OPEN_MINUTE && minute < CLOSE_MINUTE;
}

// ---- live updates ----

const MAX_NEW_BARS = 3;

/** True when `next` is `prev` with its last bar refreshed and at most a few bars appended, so the chart can update in place. */
export function isTailUpdate(prev: readonly Bar[], next: readonly Bar[]): boolean {
  if (prev.length === 0 || next.length < prev.length || next.length > prev.length + MAX_NEW_BARS)
    return false;
  for (let i = 0; i < prev.length; i++) if (prev[i].time !== next[i].time) return false;
  return true;
}

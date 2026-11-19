// AI Auto-Chart (#228, ADR 0068): the model returns coordinates only and this module decides what may be drawn.
// Pure: parsing, validation and prompt building. The model call and the mode lookup live in the route.
// Labels, risk/reward and percentages are made here, never taken from the model, and a trade setup
// exists only in unrestricted mode (local, opt-in, ADR 0054).

import { z } from 'zod';
import type { PromptMode } from '@/lib/ai/promptMode';
import type { IndicatorId } from '@/components/pro-chart/constants';
import type { Bar } from './bars';
import type { ChartPoint } from './drawings';

export type LevelKind = 'support' | 'resistance';

export interface OverlayLevel {
  kind: LevelKind;
  price: number;
  /** `S1`, `S2`, `R1`, `R2`, numbered nearest to price first. */
  label: string;
}

export interface OverlayTrendline {
  a: ChartPoint;
  b: ChartPoint;
}

export interface TradeSetup {
  direction: 'long' | 'short';
  entry: number;
  stop: number;
  target: number;
  /** Reward divided by risk, one decimal. */
  riskReward: number;
  /** Signed percent move from entry to stop and to target. */
  stopPct: number;
  targetPct: number;
}

export interface ChartOverlay {
  levels: OverlayLevel[];
  trendlines: OverlayTrendline[];
  indicators: IndicatorId[];
  /** Unrestricted mode only. */
  setup?: TradeSetup;
}

const MAX_PER_SIDE = 2;
const MAX_TRENDLINES = 2;
/** Levels closer than this to a kept one add clutter, not information. */
const DUPLICATE_PCT = 0.5;
/** A level must sit inside the traded range, widened by this much each way. */
const RANGE_SLACK = 0.1;
/** An entry further than this from the last close is not a setup for today's chart. */
const MAX_ENTRY_DISTANCE_PCT = 5;
const MAX_STOP_DISTANCE_PCT = 25;
const PROMPT_BARS = 150;

const INDICATOR_ALIASES: Record<string, IndicatorId> = {
  volume: 'volume',
  sma20: 'sma20',
  sma50: 'sma50',
  sma200: 'sma200',
  ema200: 'sma200', // no EMA 200 on the chart; SMA 200 is the long-term trend line it offers
  ema20: 'ema20',
  ema50: 'ema50',
  bb: 'bb',
  bollinger: 'bb',
  bollingerbands: 'bb',
  rsi: 'rsi',
  rsi14: 'rsi',
  macd: 'macd',
};

export function mapIndicator(raw: string): IndicatorId | null {
  return INDICATOR_ALIASES[raw.toLowerCase().replace(/[^a-z0-9]/g, '')] ?? null;
}

const num = z.coerce.number().finite();
const rawSchema = z.object({
  levels: z.array(z.unknown()).optional(),
  trendlines: z.array(z.unknown()).optional(),
  indicators: z.array(z.unknown()).optional(),
  setup: z.unknown().optional(),
});
const levelSchema = z.object({ type: z.enum(['support', 'resistance']), price: num });
const trendSchema = z.object({ startTime: z.string(), startPrice: num, endTime: z.string(), endPrice: num });
const setupSchema = z.object({ direction: z.string(), entry: num, stop: num, target: num });

/** The first `{ ... }` in the text; fences and chatter around it are ignored. */
function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;
const pct = (from: number, to: number) => round(((to - from) / from) * 100, 1);

function readLevels(raw: unknown[], lastClose: number, floor: number, ceiling: number): OverlayLevel[] {
  const picked: Record<LevelKind, number[]> = { support: [], resistance: [] };
  for (const item of raw) {
    const parsed = levelSchema.safeParse(item);
    if (!parsed.success) continue;
    const { type, price } = parsed.data;
    const rightSide = type === 'support' ? price < lastClose : price > lastClose;
    if (!rightSide || price < floor || price > ceiling) continue;
    picked[type].push(price);
  }
  const out: OverlayLevel[] = [];
  for (const [kind, prefix] of [['support', 'S'], ['resistance', 'R']] as const) {
    const nearestFirst = [...new Set(picked[kind])].sort((a, b) => Math.abs(a - lastClose) - Math.abs(b - lastClose));
    const kept: number[] = [];
    for (const price of nearestFirst) {
      if (kept.some((k) => (Math.abs(price - k) / k) * 100 < DUPLICATE_PCT)) continue;
      kept.push(price);
      if (kept.length === MAX_PER_SIDE) break;
    }
    kept.forEach((price, i) => out.push({ kind, price, label: `${prefix}${i + 1}` }));
  }
  return out;
}

/** Nearest bar to a date, so a slightly-off date from the model still lands on the chart. Null if unparseable or far outside the data. */
function snapToBar(date: string, bars: Bar[]): string | null {
  const t = Date.parse(date);
  if (Number.isNaN(t)) return null;
  const first = Date.parse(bars[0].time);
  const lastT = Date.parse(bars[bars.length - 1].time);
  const week = 7 * 24 * 60 * 60 * 1000;
  if (t < first - week || t > lastT + week) return null;
  let best = bars[0];
  for (const b of bars) if (Math.abs(Date.parse(b.time) - t) < Math.abs(Date.parse(best.time) - t)) best = b;
  return best.time;
}

function readTrendlines(raw: unknown[], bars: Bar[], floor: number, ceiling: number): OverlayTrendline[] {
  const out: OverlayTrendline[] = [];
  for (const item of raw) {
    const parsed = trendSchema.safeParse(item);
    if (!parsed.success) continue;
    const { startTime, startPrice, endTime, endPrice } = parsed.data;
    const t1 = snapToBar(startTime, bars);
    const t2 = snapToBar(endTime, bars);
    if (!t1 || !t2 || t1 === t2) continue;
    if ([startPrice, endPrice].some((p) => p < floor || p > ceiling)) continue;
    const forward = t1 < t2;
    out.push(
      forward
        ? { a: { time: t1, price: startPrice }, b: { time: t2, price: endPrice } }
        : { a: { time: t2, price: endPrice }, b: { time: t1, price: startPrice } }
    );
    if (out.length === MAX_TRENDLINES) break;
  }
  return out;
}

function readSetup(raw: unknown, lastClose: number): TradeSetup | undefined {
  const parsed = setupSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  const { entry, stop, target } = parsed.data;
  const direction = parsed.data.direction.trim().toLowerCase();
  if (direction !== 'long' && direction !== 'short') return undefined;
  const ordered = direction === 'long' ? stop < entry && entry < target : target < entry && entry < stop;
  if (!ordered || entry <= 0 || stop <= 0 || target <= 0) return undefined;
  if ((Math.abs(entry - lastClose) / lastClose) * 100 > MAX_ENTRY_DISTANCE_PCT) return undefined;
  if ((Math.abs(entry - stop) / entry) * 100 > MAX_STOP_DISTANCE_PCT) return undefined;
  return {
    direction,
    entry,
    stop,
    target,
    riskReward: round(Math.abs(target - entry) / Math.abs(entry - stop), 1),
    stopPct: pct(entry, stop),
    targetPct: pct(entry, target),
  };
}

/** Null when the reply cannot be read or leaves nothing worth drawing. */
export function parseOverlay(text: string, bars: Bar[], mode: PromptMode): ChartOverlay | null {
  if (bars.length === 0) return null;
  const whole = rawSchema.safeParse(extractJson(text));
  if (!whole.success) return null;

  const lastClose = bars[bars.length - 1].close;
  const low = Math.min(...bars.map((b) => b.low));
  const high = Math.max(...bars.map((b) => b.high));
  const floor = low * (1 - RANGE_SLACK);
  const ceiling = high * (1 + RANGE_SLACK);

  const indicators: IndicatorId[] = [];
  for (const raw of whole.data.indicators ?? []) {
    const id = typeof raw === 'string' ? mapIndicator(raw) : null;
    if (id && !indicators.includes(id)) indicators.push(id);
  }

  const overlay: ChartOverlay = {
    levels: readLevels(whole.data.levels ?? [], lastClose, floor, ceiling),
    trendlines: readTrendlines(whole.data.trendlines ?? [], bars, floor, ceiling),
    indicators,
  };
  // Guarded mode never carries a setup, whatever the model emitted (ADR 0054: enforced on the server).
  const setup = mode === 'unrestricted' ? readSetup(whole.data.setup, lastClose) : undefined;
  if (setup) overlay.setup = setup;

  const empty = overlay.levels.length === 0 && overlay.trendlines.length === 0 && overlay.indicators.length === 0 && !overlay.setup;
  return empty ? null : overlay;
}

/** Compact CSV of the recent bars. Numbers come from our own price API, not from user or web text. */
export function buildOverlayPrompt(symbol: string, bars: Bar[], count = PROMPT_BARS): string {
  const recent = bars.slice(-count);
  const lastClose = bars[bars.length - 1]?.close ?? 0;
  const rows = recent.map((b) => `${b.time},${b.high},${b.low},${b.close}`);
  return [
    `Symbol: ${symbol} (Indian-listed, daily bars, prices in INR).`,
    `Last close: ${lastClose}`,
    'Columns: date,high,low,close (oldest first).',
    ...rows,
  ].join('\n');
}

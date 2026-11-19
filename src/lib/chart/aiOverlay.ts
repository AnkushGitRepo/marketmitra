// AI Auto-Chart (#228, ADR 0068): the model returns coordinates only and this module decides what may be drawn.
// Pure: parsing, validation and prompt building. The model call and the mode lookup live in the route.
// Labels, risk/reward and percentages are made here, never taken from the model, and a trade setup
// exists only in unrestricted mode (local, opt-in, ADR 0054). The trade setup is planned by `setupPlanner.ts` from the validated
// levels; the model's own entry, stop and target prices are never used.

import { z } from 'zod';
import type { PromptMode } from '@/lib/ai/promptMode';
import type { IndicatorId } from '@/components/pro-chart/constants';
import type { Bar } from './bars';
import type { ChartPoint } from './drawings';
import { planSetup, swingLevels, type TradeSetup } from './setupPlanner';
import {
  barTimeLabel,
  barTimeMs,
  parseBarTimeLabel,
  timeframeDef,
  type Timeframe,
} from './timeframes';

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

export type { TradeSetup } from './setupPlanner';

export interface ChartOverlay {
  levels: OverlayLevel[];
  trendlines: OverlayTrendline[];
  indicators: IndicatorId[];
  /** Unrestricted mode only. */
  setup?: TradeSetup;
  /** Unrestricted mode only: why there is no setup, when there is none. */
  setupNote?: string;
}

const MAX_PER_SIDE = 2;
const MAX_TRENDLINES = 2;
/** Levels closer than a sixteenth of the timeframe's entry distance to a kept one add clutter, not information (0.5% on Day). */
const DUPLICATE_PCT_DIVISOR = 16;
/** A level must sit inside the traded range, widened by this much each way. */
const RANGE_SLACK = 0.1;
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
  bias: z.unknown().optional(),
  setup: z.unknown().optional(),
});
const levelSchema = z.object({ type: z.enum(['support', 'resistance']), price: num });
const trendSchema = z.object({
  startTime: z.string(),
  startPrice: num,
  endTime: z.string(),
  endPrice: num,
});
const biasSchema = z.object({
  bias: z.string().optional(),
  setup: z.object({ direction: z.string().optional() }).partial().optional(),
});

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

function readLevels(
  raw: unknown[],
  lastClose: number,
  floor: number,
  ceiling: number,
  duplicatePct: number,
): OverlayLevel[] {
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
  for (const [kind, prefix] of [
    ['support', 'S'],
    ['resistance', 'R'],
  ] as const) {
    const nearestFirst = [...new Set(picked[kind])].sort(
      (a, b) => Math.abs(a - lastClose) - Math.abs(b - lastClose),
    );
    const kept: number[] = [];
    for (const price of nearestFirst) {
      if (kept.some((k) => (Math.abs(price - k) / k) * 100 < duplicatePct)) continue;
      kept.push(price);
      if (kept.length === MAX_PER_SIDE) break;
    }
    kept.forEach((price, i) => out.push({ kind, price, label: `${prefix}${i + 1}` }));
  }
  return out;
}

/** Nearest bar to a time the model wrote (a date, or `date hh:mm` IST for intraday). Null if unparseable or well outside the data. */
function snapToBar(label: string, bars: Bar[], slackMs: number): string | null {
  const parsed = parseBarTimeLabel(label);
  const t = parsed === null ? Date.parse(label) : barTimeMs(parsed);
  if (Number.isNaN(t)) return null;
  if (t < barTimeMs(bars[0].time) - slackMs || t > barTimeMs(bars[bars.length - 1].time) + slackMs)
    return null;
  let best = bars[0];
  for (const b of bars)
    if (Math.abs(barTimeMs(b.time) - t) < Math.abs(barTimeMs(best.time) - t)) best = b;
  return best.time;
}

function readTrendlines(
  raw: unknown[],
  bars: Bar[],
  floor: number,
  ceiling: number,
  slackMs: number,
): OverlayTrendline[] {
  const out: OverlayTrendline[] = [];
  for (const item of raw) {
    const parsed = trendSchema.safeParse(item);
    if (!parsed.success) continue;
    const { startTime, startPrice, endTime, endPrice } = parsed.data;
    const t1 = snapToBar(startTime, bars, slackMs);
    const t2 = snapToBar(endTime, bars, slackMs);
    if (!t1 || !t2 || t1 === t2) continue;
    if ([startPrice, endPrice].some((p) => p < floor || p > ceiling)) continue;
    const forward = barTimeMs(t1) < barTimeMs(t2);
    out.push(
      forward
        ? { a: { time: t1, price: startPrice }, b: { time: t2, price: endPrice } }
        : { a: { time: t2, price: endPrice }, b: { time: t1, price: startPrice } },
    );
    if (out.length === MAX_TRENDLINES) break;
  }
  return out;
}

/** The model's lean ("long" / "short"); anything else is no lean. Its prices are ignored. */
function readBias(raw: unknown): 'long' | 'short' | null {
  const parsed = biasSchema.safeParse(raw);
  if (!parsed.success) return null;
  const word = (parsed.data.bias ?? parsed.data.setup?.direction ?? '').trim().toLowerCase();
  return word === 'long' || word === 'short' ? word : null;
}

/** Support and resistance prices to plan around: the model's validated levels first, then swing points the price really turned at. */
function planningLevels(levels: OverlayLevel[], bars: Bar[]): { supports: number[]; resistances: number[] } {
  const swings = swingLevels(bars);
  const unique = (xs: number[]) => [...new Set(xs)];
  return {
    supports: unique([...levels.filter((l) => l.kind === 'support').map((l) => l.price), ...swings.supports]),
    resistances: unique([...levels.filter((l) => l.kind === 'resistance').map((l) => l.price), ...swings.resistances]),
  };
}

/** Null when the reply cannot be read or leaves nothing worth drawing. */
export function parseOverlay(
  text: string,
  bars: Bar[],
  mode: PromptMode,
  timeframe: Timeframe = '1d',
): ChartOverlay | null {
  const def = timeframeDef(timeframe);
  // Times may be a little outside the data: a week on Day, a day on intraday.
  const slackMs = (timeframe === '1d' ? 7 : 1) * 24 * 60 * 60 * 1000;
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
    levels: readLevels(
      whole.data.levels ?? [],
      lastClose,
      floor,
      ceiling,
      def.maxEntryDistancePct / DUPLICATE_PCT_DIVISOR,
    ),
    trendlines: readTrendlines(whole.data.trendlines ?? [], bars, floor, ceiling, slackMs),
    indicators,
  };
  // Guarded mode never carries a setup, whatever the model emitted (ADR 0054: enforced on the server).
  if (mode === 'unrestricted') {
    const plan = planSetup({
      bars,
      ...planningLevels(overlay.levels, bars),
      timeframe,
      bias: readBias(whole.data),
    });
    if (plan.setup) overlay.setup = plan.setup;
    else overlay.setupNote = plan.reason;
  }

  const empty =
    overlay.levels.length === 0 &&
    overlay.trendlines.length === 0 &&
    overlay.indicators.length === 0 &&
    !overlay.setup;
  return empty ? null : overlay;
}

/** Compact CSV of the recent bars. Numbers come from our own price API, not from user or web text. */
export function buildOverlayPrompt(
  symbol: string,
  bars: Bar[],
  count = PROMPT_BARS,
  timeframe: Timeframe = '1d',
): string {
  const recent = bars.slice(-count);
  const lastClose = bars[bars.length - 1]?.close ?? 0;
  const rows = recent.map((b) => `${barTimeLabel(b.time)},${b.high},${b.low},${b.close}`);
  const unit =
    timeframe === '1d' ? 'daily bars' : `${timeframeDef(timeframe).label} candles, times in IST`;
  return [
    `Symbol: ${symbol} (Indian-listed, ${unit}, prices in INR).`,
    `Last close: ${lastClose}`,
    'Columns: time,high,low,close (oldest first).',
    ...rows,
  ].join('\n');
}

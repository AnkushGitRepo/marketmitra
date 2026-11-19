// Plans a trade setup the way an investor does (#238, ADR 0068): find where the market has turned, enter at that level (a pullback to
// support, a retest of resistance) or right now if price is already there, put the stop beyond the level that would prove the idea
// wrong, aim for the nearest opposing level that pays at least 1.5 : 1, and skip the trade when nothing does. The model supplies the
// levels (validated elsewhere); every price and ratio here is computed in code. Pure. Unrestricted mode only: the caller never
// calls this in guarded mode.

import { atr, ema } from './indicators';
import type { Bar } from './bars';
import { timeframeDef, type Timeframe } from './timeframes';

export type EntryType = 'now' | 'pullback' | 'retest';

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
  /** `now`: price is already at the zone. `pullback` / `retest`: a limit order at the level, waiting for price to come back to it. */
  entryType: EntryType;
  /** The last close the plan was made at. */
  lastClose: number;
}

export interface PlanInput {
  bars: Bar[];
  /** Support prices (any side of the close; those at or above it are ignored). */
  supports: number[];
  resistances: number[];
  timeframe: Timeframe;
  /** The model's lean, used only when the trend gives no direction and both sides are valid. */
  bias?: 'long' | 'short' | null;
}

export type PlanResult =
  { setup: TradeSetup; reason?: undefined } | { setup: null; reason: string };

export const MIN_RISK_REWARD = 1.5;
const ATR_PERIOD = 14;
const STOP_BUFFER_ATR = 0.5;
const NEAR_ATR = 0.75;
const LIMIT_OFFSET_ATR = 0.1;
const MIN_BARS_FOR_TREND = 50;

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;
const pct = (from: number, to: number) => round(((to - from) / from) * 100, 1);
const price = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

function lastValue(series: (number | null)[]): number | null {
  for (let i = series.length - 1; i >= 0; i--) if (series[i] !== null) return series[i];
  return null;
}

/** ATR, or the mean high-low range of the last bars when there are too few for ATR. */
function volatility(bars: Bar[]): number {
  const fromAtr = lastValue(
    atr(
      bars.map((b) => b.high),
      bars.map((b) => b.low),
      bars.map((b) => b.close),
      ATR_PERIOD,
    ),
  );
  if (fromAtr !== null && fromAtr > 0) return fromAtr;
  const recent = bars.slice(-ATR_PERIOD);
  return recent.reduce((sum, b) => sum + (b.high - b.low), 0) / Math.max(recent.length, 1);
}

type Trend = 'up' | 'down' | 'none';

function trendOf(bars: Bar[]): Trend {
  if (bars.length < MIN_BARS_FOR_TREND) return 'none';
  const closes = bars.map((b) => b.close);
  const fast = lastValue(ema(closes, 20));
  const slow = lastValue(ema(closes, 50));
  const last = closes[closes.length - 1];
  if (fast === null || slow === null) return 'none';
  if (last > slow && fast > slow) return 'up';
  if (last < slow && fast < slow) return 'down';
  return 'none';
}

interface Candidate {
  setup: TradeSetup;
}

function build(
  direction: 'long' | 'short',
  entry: number,
  stop: number,
  target: number,
  entryType: EntryType,
  lastClose: number,
): TradeSetup {
  return {
    direction,
    entry: round(entry, 2),
    stop: round(stop, 2),
    target: round(target, 2),
    riskReward: round(Math.abs(target - entry) / Math.abs(entry - stop), 1),
    stopPct: pct(entry, stop),
    targetPct: pct(entry, target),
    entryType,
    lastClose,
  };
}

function plan(
  side: 'long' | 'short',
  input: PlanInput,
  last: number,
  range: number,
): Candidate | null {
  const def = timeframeDef(input.timeframe);
  const sign = side === 'long' ? 1 : -1;
  // The level to trade from: the nearest support below (long) or resistance above (short).
  const own = (
    side === 'long'
      ? input.supports.filter((p) => p < last)
      : input.resistances.filter((p) => p > last)
  ).sort((a, b) => Math.abs(a - last) - Math.abs(b - last))[0];
  if (own === undefined) return null;

  const atZone = Math.abs(last - own) <= NEAR_ATR * range;
  const entry = atZone ? last : own + sign * LIMIT_OFFSET_ATR * range;
  const stop = own - sign * STOP_BUFFER_ATR * range;
  const risk = Math.abs(entry - stop);
  if (risk <= 0) return null;
  if ((Math.abs(entry - last) / last) * 100 > def.maxEntryDistancePct) return null; // a limit order too far away is not a plan for this chart
  if ((risk / entry) * 100 > def.maxStopDistancePct) return null;

  const opposing = (
    side === 'long'
      ? input.resistances.filter((p) => p > entry)
      : input.supports.filter((p) => p < entry)
  ).sort((a, b) => Math.abs(a - entry) - Math.abs(b - entry));
  const target = opposing.find((p) => Math.abs(p - entry) / risk >= MIN_RISK_REWARD);
  if (target === undefined) return null;
  return {
    setup: build(
      side,
      entry,
      stop,
      target,
      atZone ? 'now' : side === 'long' ? 'pullback' : 'retest',
      last,
    ),
  };
}

function explain(input: PlanInput, last: number): string {
  const s = input.supports.filter((p) => p < last).sort((a, b) => b - a)[0];
  const r = input.resistances.filter((p) => p > last).sort((a, b) => a - b)[0];
  if (s === undefined && r === undefined)
    return 'No clear support or resistance to plan a trade around right now.';
  const where = [
    s !== undefined ? `support ${price(s)}` : null,
    r !== undefined ? `resistance ${price(r)}` : null,
  ]
    .filter(Boolean)
    .join(' and ');
  return `No clean setup right now: nothing pays at least ${MIN_RISK_REWARD} : 1 from ${where}. A pullback to support, a retest of resistance, or a break past a level would change that.`;
}

export function planSetup(input: PlanInput): PlanResult {
  if (input.bars.length === 0)
    return { setup: null, reason: 'Not enough price history to plan a trade.' };
  const last = input.bars[input.bars.length - 1].close;
  const range = volatility(input.bars);
  const long = plan('long', input, last, range);
  const short = plan('short', input, last, range);

  const trend = trendOf(input.bars);
  const pick = (() => {
    if (long && short) {
      if (trend === 'up') return long;
      if (trend === 'down') return short;
      if (input.bias === 'long') return long;
      if (input.bias === 'short') return short;
      return long.setup.riskReward >= short.setup.riskReward ? long : short;
    }
    return long ?? short;
  })();
  return pick ? { setup: pick.setup } : { setup: null, reason: explain(input, last) };
}

const CLUSTER_ATR = 0.5;

/**
 * Support and resistance from swing points: a bar whose low (high) is the lowest (highest) of `wing` bars either side, clustered
 * when within half an ATR and ranked by how often price turned there. For the planner to fall back on when the model gave few levels.
 */
export function swingLevels(bars: Bar[], wing = 5): { supports: number[]; resistances: number[] } {
  if (bars.length < wing * 2 + 1) return { supports: [], resistances: [] };
  const range = volatility(bars);
  const lows: number[] = [];
  const highs: number[] = [];
  for (let i = wing; i < bars.length - wing; i++) {
    const slice = bars.slice(i - wing, i + wing + 1);
    if (bars[i].low === Math.min(...slice.map((b) => b.low))) lows.push(bars[i].low);
    if (bars[i].high === Math.max(...slice.map((b) => b.high))) highs.push(bars[i].high);
  }
  const cluster = (points: number[]): number[] => {
    const groups: number[][] = [];
    for (const p of [...points].sort((a, b) => a - b)) {
      const group = groups.find((g) => Math.abs(g[g.length - 1] - p) <= CLUSTER_ATR * range);
      if (group) group.push(p);
      else groups.push([p]);
    }
    return groups
      .sort((a, b) => b.length - a.length)
      .map((g) => round(g.reduce((x, y) => x + y, 0) / g.length, 2));
  };
  return { supports: cluster(lows), resistances: cluster(highs) };
}

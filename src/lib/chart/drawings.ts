/** Drawing-tool model. Drawings are stored in data space (bar time + price),
 * never pixels, so they stay put when the chart zooms, pans or resizes. */

export type DrawingTool =
  | 'cursor'
  | 'trend'
  | 'ray'
  | 'hline'
  | 'vline'
  | 'rect'
  | 'long'
  | 'short'
  | 'fib'
  | 'measure'
  | 'text';

export interface ChartPoint {
  /** Bar time (ISO date). */
  time: string;
  price: number;
}

export type Drawing =
  | { id: string; kind: 'trend'; a: ChartPoint; b: ChartPoint }
  | { id: string; kind: 'ray'; a: ChartPoint; b: ChartPoint }
  | { id: string; kind: 'hline'; a: ChartPoint }
  | { id: string; kind: 'vline'; a: ChartPoint }
  | { id: string; kind: 'rect'; a: ChartPoint; b: ChartPoint }
  /** The user's own position sketch: `a` is the entry, `b` the target; the stop is derived (see `positionLevels`). */
  | { id: string; kind: 'long' | 'short'; a: ChartPoint; b: ChartPoint }
  | { id: string; kind: 'fib'; a: ChartPoint; b: ChartPoint }
  | { id: string; kind: 'measure'; a: ChartPoint; b: ChartPoint }
  | { id: string; kind: 'text'; a: ChartPoint; text: string };

export const FIB_LEVELS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1] as const;

/** Retracement prices for a swing from `p1` to `p2`: ratio 1 sits at p1 and
 * ratio 0 at p2 (the level price retraces back toward p1 from the latest swing). */
export function fibPrices(p1: number, p2: number): { ratio: number; price: number }[] {
  return FIB_LEVELS.map((ratio) => ({ ratio, price: p2 + (p1 - p2) * ratio }));
}

export function measure(
  from: { price: number; index: number },
  to: { price: number; index: number },
): { change: number; percent: number; bars: number } {
  const change = to.price - from.price;
  return {
    change,
    percent: from.price === 0 ? 0 : (change / from.price) * 100,
    bars: Math.abs(to.index - from.index),
  };
}

/** Stop and ratios for a hand-drawn position. The stop sits on the opposite side of entry at half the target distance (reward : risk = 2 : 1). */
export function positionLevels(
  kind: 'long' | 'short',
  entry: number,
  target: number,
): { stop: number; riskReward: number; targetPct: number; stopPct: number } {
  const stop = entry - (target - entry) / 2;
  const pct = (to: number) => (entry === 0 ? 0 : ((to - entry) / entry) * 100);
  void kind; // direction comes from where the target was clicked; the maths is symmetric
  return { stop, riskReward: 2, targetPct: pct(target), stopPct: pct(stop) };
}

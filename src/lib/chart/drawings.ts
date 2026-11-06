/** Drawing-tool model. Drawings are stored in data space (bar time + price),
 * never pixels, so they stay put when the chart zooms, pans or resizes. */

export type DrawingTool = 'cursor' | 'trend' | 'hline' | 'fib' | 'measure' | 'text';

export interface ChartPoint {
  /** Bar time (ISO date). */
  time: string;
  price: number;
}

export type Drawing =
  | { id: string; kind: 'trend'; a: ChartPoint; b: ChartPoint }
  | { id: string; kind: 'hline'; a: ChartPoint }
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
  to: { price: number; index: number }
): { change: number; percent: number; bars: number } {
  const change = to.price - from.price;
  return {
    change,
    percent: from.price === 0 ? 0 : (change / from.price) * 100,
    bars: Math.abs(to.index - from.index),
  };
}

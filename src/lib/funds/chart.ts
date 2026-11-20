// Geometry for the NAV line chart: plain SVG, no chart library. Pure, so it tests
// without a browser. The series is the stored NAV as published.

import type { NavPoint } from './types';

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
  readonly index: number;
  readonly date: string;
  readonly nav: number;
}

export interface Chart {
  readonly points: readonly ChartPoint[];
  readonly path: string;
  readonly min: number;
  readonly max: number;
  /** Percent change from the first to the last point. */
  readonly change: number;
}

/** Evenly thin a long series to at most `max` points, always keeping the first and last. */
export function downsample(series: readonly NavPoint[], max: number): NavPoint[] {
  if (series.length <= max || max < 2) return [...series];
  const step = (series.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => series[Math.round(i * step)] as NavPoint);
}

/**
 * `pad` is the margin on the other three sides; `padLeft` (default `pad`) is a wider left margin for the axis
 * labels, so a label sits beside the line and never on it.
 */
export function buildChart(series: readonly NavPoint[], width: number, height: number, pad: number, padLeft: number = pad): Chart | null {
  if (series.length < 2) return null;
  const navs = series.map((p) => p.nav);
  const min = Math.min(...navs);
  const max = Math.max(...navs);
  const span = max - min;
  const innerW = width - padLeft - pad;
  const innerH = height - pad * 2;

  const points: ChartPoint[] = series.map((p, index) => ({
    x: padLeft + (index / (series.length - 1)) * innerW,
    // A flat series sits mid-chart; otherwise the high is at the top.
    y: span === 0 ? height / 2 : pad + (1 - (p.nav - min) / span) * innerH,
    index,
    date: p.date,
    nav: p.nav,
  }));
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)},${round(p.y)}`).join(' ');
  const first = series[0] as NavPoint;
  const last = series[series.length - 1] as NavPoint;
  return { points, path, min, max, change: first.nav > 0 ? (last.nav / first.nav - 1) * 100 : 0 };
}

export function nearestPoint(points: readonly ChartPoint[], x: number): ChartPoint | null {
  if (points.length === 0) return null;
  let best = points[0] as ChartPoint;
  for (const p of points) {
    if (Math.abs(p.x - x) < Math.abs(best.x - x)) best = p;
  }
  return best;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Validate an untrusted NAV series (an API response) before it reaches the chart. */
export function parseNavSeries(input: unknown): NavPoint[] | null {
  if (!Array.isArray(input)) return null;
  const out: NavPoint[] = [];
  for (const item of input) {
    if (typeof item !== 'object' || item === null) return null;
    const { date, nav } = item as { date?: unknown; nav?: unknown };
    if (typeof date !== 'string' || typeof nav !== 'number' || !Number.isFinite(nav)) return null;
    out.push({ date, nav });
  }
  return out;
}

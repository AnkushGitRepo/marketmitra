import type { Bar } from './bars';

// Fail-safe for the stock chart (#64): when the interactive chart can't start, errors, or measures as collapsed,
// the page shows a plain SVG line chart drawn from the same bars instead of a blank box.

/** Below this measured height the interactive chart is considered collapsed (its configured height is 420px+). */
export const MIN_HEALTHY_HEIGHT_PX = 200;

export interface HealthInput {
  /** The chart library threw while creating or updating. */
  readonly errored: boolean;
  /** Measured container height in px, or null if it could not be measured. */
  readonly measuredHeight: number | null;
}

export function shouldUseFallback({ errored, measuredHeight }: HealthInput): boolean {
  if (errored) return true;
  return measuredHeight !== null && measuredHeight < MIN_HEALTHY_HEIGHT_PX;
}

const MAX_POINTS = 320;

/** Evenly thins a long series (keeping first and last) so the SVG stays small. */
export function downsample<T>(items: readonly T[], maxPoints: number = MAX_POINTS): T[] {
  if (items.length <= maxPoints) return [...items];
  const out: T[] = [];
  const step = (items.length - 1) / (maxPoints - 1);
  for (let i = 0; i < maxPoints; i++) out.push(items[Math.round(i * step)]);
  return out;
}

export interface LineChartGeometry {
  readonly path: string;
  readonly areaPath: string;
  readonly min: number;
  readonly max: number;
  readonly first: number;
  readonly last: number;
  readonly points: number;
}

/**
 * SVG path for a close-price line inside a `width` × `height` box with `pad` inset. Returns null when there is
 * nothing to draw (fewer than two valid bars). A flat series is drawn as a mid-height line, never NaN.
 */
export function buildLineChart(bars: readonly Bar[], width: number, height: number, pad = 8): LineChartGeometry | null {
  const closes = downsample(bars.filter((b) => Number.isFinite(b.close))).map((b) => b.close);
  if (closes.length < 2 || width <= pad * 2 || height <= pad * 2) return null;

  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min;
  const innerW = width - pad * 2;
  const innerH = height - pad * 2;
  const xAt = (i: number) => pad + (i / (closes.length - 1)) * innerW;
  const yAt = (v: number) => (span === 0 ? height / 2 : pad + (1 - (v - min) / span) * innerH);

  const pts = closes.map((c, i) => `${xAt(i).toFixed(1)},${yAt(c).toFixed(1)}`);
  const path = `M${pts.join(' L')}`;
  const areaPath = `${path} L${xAt(closes.length - 1).toFixed(1)},${(height - pad).toFixed(1)} L${xAt(0).toFixed(1)},${(height - pad).toFixed(1)} Z`;
  return { path, areaPath, min, max, first: closes[0], last: closes[closes.length - 1], points: closes.length };
}

/**
 * True if RGBA pixel data contains any visible (non-transparent) pixel. Samples every `step`-th pixel, so scanning a
 * full-size canvas stays cheap. Used to detect a chart that "started" but drew nothing.
 */
export function hasVisibleInk(rgba: ArrayLike<number>, step = 16): boolean {
  const stride = Math.max(1, Math.floor(step)) * 4;
  for (let i = 3; i < rgba.length; i += stride) {
    if (rgba[i] > 0) return true;
  }
  return false;
}

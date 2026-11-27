// Pure geometry and statistics for the value chart (#424): pixel positions, a smooth path, axis ticks, the pointer's
// nearest point, and the headline numbers (high, low, change). Nothing here touches the DOM, so it tests without one.

export interface Padding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface PlotPoint {
  readonly i: number;
  readonly x: number;
  readonly y: number;
  readonly v: number;
  readonly label: string;
}

export interface SeriesStats {
  readonly first: number;
  readonly last: number;
  readonly high: { readonly index: number; readonly value: number };
  readonly low: { readonly index: number; readonly value: number };
  readonly change: number;
  /** Percent change from the first value; null when the first value is zero. */
  readonly changePct: number | null;
}

/** High, low and change over a series; null for an empty one. The first high or low wins a tie. */
export function seriesStats(values: readonly number[]): SeriesStats | null {
  if (values.length === 0) return null;
  let high = 0;
  let low = 0;
  values.forEach((v, i) => {
    if (v > values[high]) high = i;
    if (v < values[low]) low = i;
  });
  const first = values[0];
  const last = values[values.length - 1];
  return {
    first,
    last,
    high: { index: high, value: values[high] },
    low: { index: low, value: values[low] },
    change: last - first,
    changePct: first === 0 ? null : ((last - first) / first) * 100,
  };
}

/** Round, evenly spaced axis values that cover [min, max]. A flat range gets a single tick. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (max <= min) return [min];
  const rough = (max - min) / Math.max(target - 1, 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const residual = rough / magnitude;
  const step = (residual >= 5 ? 10 : residual >= 2 ? 5 : residual >= 1 ? 2 : 1) * magnitude;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max + step * 1e-9; t += step) ticks.push(Number(t.toFixed(10)));
  return ticks;
}

/** Positions of each value inside a width x height box with padding. x is spread evenly; y is scaled to the series range. */
export function plotPoints(values: readonly number[], labels: readonly string[], width: number, height: number, pad: Padding): PlotPoint[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const innerW = Math.max(width - pad.left - pad.right, 1);
  const innerH = Math.max(height - pad.top - pad.bottom, 1);
  return values.map((v, i) => ({
    i,
    x: values.length === 1 ? pad.left + innerW / 2 : pad.left + (i * innerW) / (values.length - 1),
    // A flat series sits in the middle rather than on the top edge.
    y: max === min ? pad.top + innerH / 2 : pad.top + (1 - (v - min) / span) * innerH,
    v,
    label: labels[i] ?? '',
  }));
}

/** The y position of an arbitrary value on the same scale as `plotPoints`. */
export function yFor(value: number, values: readonly number[], height: number, pad: Padding): number {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const innerH = Math.max(height - pad.top - pad.bottom, 1);
  return max === min ? pad.top + innerH / 2 : pad.top + (1 - (value - min) / (max - min)) * innerH;
}

/**
 * A smooth SVG path through the points (monotone cubic, Fritsch-Carlson): it passes through every point and never
 * rises above the highest or dips below the lowest, so it cannot invent a peak the data did not have.
 */
export function smoothPath(pts: readonly PlotPoint[]): string {
  const n = pts.length;
  if (n === 0) return '';
  const f = (p: PlotPoint) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`;
  if (n === 1) return `M${f(pts[0])}`;
  if (n === 2) return `M${f(pts[0])} L${f(pts[1])}`;

  const dx = pts.slice(1).map((p, i) => p.x - pts[i].x);
  const slope = pts.slice(1).map((p, i) => (dx[i] === 0 ? 0 : (p.y - pts[i].y) / dx[i]));
  const tangent: number[] = [slope[0]];
  for (let i = 1; i < n - 1; i++) tangent.push(slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2);
  tangent.push(slope[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0;
      tangent[i + 1] = 0;
      continue;
    }
    const a = tangent[i] / slope[i];
    const b = tangent[i + 1] / slope[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      tangent[i] = t * a * slope[i];
      tangent[i + 1] = t * b * slope[i];
    }
  }
  let d = `M${f(pts[0])}`;
  for (let i = 0; i < n - 1; i++) {
    const w = dx[i] / 3;
    d += ` C${(pts[i].x + w).toFixed(1)} ${(pts[i].y + tangent[i] * w).toFixed(1)} ${(pts[i + 1].x - w).toFixed(1)} ${(pts[i + 1].y - tangent[i + 1] * w).toFixed(1)} ${f(pts[i + 1])}`;
  }
  return d;
}

/** Closes a line path down to the baseline so it can be filled. */
export function areaPath(line: string, pts: readonly PlotPoint[], baseY: number): string {
  if (pts.length === 0 || !line) return '';
  return `${line} L${pts[pts.length - 1].x.toFixed(1)} ${baseY.toFixed(1)} L${pts[0].x.toFixed(1)} ${baseY.toFixed(1)} Z`;
}

/** Index of the point nearest to a pointer at `offsetX` (relative to the chart's left edge), for points spread over [left, width - right]. */
export function nearestIndex(offsetX: number, count: number, width: number, pad: Padding): number {
  if (count <= 1) return 0;
  const innerW = Math.max(width - pad.left - pad.right, 1);
  const ratio = (offsetX - pad.left) / innerW;
  return Math.min(count - 1, Math.max(0, Math.round(ratio * (count - 1))));
}

/** A rupee amount in short Indian units for an axis label: 54.8k, 1.2L, 3.4Cr. */
export function compactInr(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const trim = (n: number) => n.toFixed(1).replace(/\.0$/, '');
  if (abs >= 1e7) return `${sign}₹${trim(abs / 1e7)}Cr`;
  if (abs >= 1e5) return `${sign}₹${trim(abs / 1e5)}L`;
  if (abs >= 1e3) return `${sign}₹${trim(abs / 1e3)}k`;
  return `${sign}₹${Math.round(abs)}`;
}

/**
 * Which points get an X-axis label. A label shows on the first point where it changes (many points share a month, so
 * repeating it would print "Sep Sep Aug"), and is dropped when it would sit closer than `minGap` pixels to the last
 * one kept.
 */
export function visibleTicks(pts: readonly PlotPoint[], minGap: number): PlotPoint[] {
  const kept: PlotPoint[] = [];
  let lastLabel = '';
  for (const p of pts) {
    if (!p.label || p.label === lastLabel) continue;
    lastLabel = p.label;
    if (kept.length === 0 || p.x - kept[kept.length - 1].x >= minGap) kept.push(p);
  }
  return kept;
}

// The geometry of the combined trajectory chart (#394), shared by the on-screen chart and the print document so the two draw the
// same lines: solid for actual years, dashed from the last actual on for projected ones. Pure, so the components only draw.

import type { TrajectoryChartBlock, TrajectoryView } from './blocks';
import { linePaths, type Point } from './chartMath';

export interface TrajectoryBox {
  readonly width: number;
  readonly height: number;
  readonly pad: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
}

export interface TrajectoryLine {
  readonly name: string;
  /** Path strings for the actual years (a gap in the data splits it). */
  readonly actual: readonly string[];
  /** Path strings for the projected years, starting from the last actual point so the dashed line continues the solid one. */
  readonly projected: readonly string[];
  /** Where each year's point sits; null for a year with no figure. */
  readonly points: readonly (Point | null)[];
}

export interface TrajectoryGeometry {
  readonly ticks: readonly number[];
  readonly yFor: (value: number) => number;
  readonly xFor: (index: number) => number;
  /** The x of the line that separates actuals from projections, or null when nothing is projected. */
  readonly dividerX: number | null;
  readonly lines: readonly TrajectoryLine[];
}

const TICKS = 4;

/** A step of 1, 2, 2.5, 5 or 10 times a power of ten, at least `rough`. */
function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  return [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude;
}

/** Axis ticks covering the values: from zero for amounts (a line chart of sales should show how far it is from nothing), snug for an index. */
export function axisTicks(values: readonly number[], fromZero: boolean): number[] {
  if (values.length === 0) return [0, 1];
  const hi = Math.max(...values);
  const lo = fromZero ? Math.min(0, ...values) : Math.min(...values);
  if (hi === lo) return [lo, lo + 1];
  const step = niceStep((hi - lo) / TICKS);
  const start = Math.floor(lo / step) * step;
  const ticks: number[] = [];
  for (let t = start; t < hi + step; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return ticks;
}

export function trajectoryGeometry(block: Pick<TrajectoryChartBlock, 'labels' | 'projectedFrom'>, view: TrajectoryView, box: TrajectoryBox): TrajectoryGeometry {
  const values = view.series.flatMap((s) => s.values).filter((v): v is number => v !== null);
  const ticks = axisTicks(values, view.key !== 'indexed');
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const innerW = box.width - box.pad.left - box.pad.right;
  const innerH = box.height - box.pad.top - box.pad.bottom;
  const n = Math.max(block.labels.length - 1, 1);
  const xFor = (i: number): number => box.pad.left + (i / n) * innerW;
  const yFor = (v: number): number => box.pad.top + (1 - (v - lo) / (hi - lo || 1)) * innerH;
  const from = block.projectedFrom;
  const lines = view.series.map((s) => {
    const points = s.values.map((v, i): Point | null => (v === null ? null : [xFor(i), yFor(v)]));
    const actual = from === null ? points : points.map((p, i) => (i < from ? p : null));
    // The projected run begins at the last actual point (when there is one) so the two styles join.
    const projected = from === null ? [] : points.map((p, i) => (i >= from - 1 ? p : null));
    return { name: s.name, actual: linePaths(actual), projected: from === null ? [] : linePaths(projected), points };
  });
  return { ticks, yFor, xFor, dividerX: from === null ? null : (xFor(from - 1) + xFor(from)) / 2, lines };
}

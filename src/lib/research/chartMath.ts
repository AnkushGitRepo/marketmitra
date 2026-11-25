// Pure geometry and ordering for the report blocks, so the components only draw.

import type { DonutSlice, TableCell } from './blocks';

/** The axis range of a bar chart: always includes zero, so bars grow from a baseline and a loss points down. */
export function barRange(series: readonly (readonly (number | null)[])[]): { min: number; max: number } {
  const values = series.flat().filter((v): v is number => v !== null);
  if (values.length === 0) return { min: 0, max: 1 };
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  return max === min ? { min, max: min + 1 } : { min, max };
}

/** Where a value sits in 0..1 of the range. */
export const fraction = (value: number, range: { min: number; max: number }): number => (value - range.min) / (range.max - range.min);

export interface DonutArc {
  readonly label: string;
  readonly value: number;
  readonly share: number;
  /** Where the arc starts, as a share of the full circle. */
  readonly start: number;
}

export function donutArcs(slices: readonly DonutSlice[]): DonutArc[] {
  const positive = slices.filter((s) => s.value > 0);
  const total = positive.reduce((a, s) => a + s.value, 0);
  if (total === 0) return [];
  let start = 0;
  return positive.map((s) => {
    const arc = { label: s.label, value: s.value, share: s.value / total, start };
    start += arc.share;
    return arc;
  });
}

/** Indexes of the best cell(s) in a column. Needs two figures to compare, so a lone value is not "best". */
export function bestRows(values: readonly TableCell[], best: 'high' | 'low'): ReadonlySet<number> {
  const numeric = values.map((v, i) => [v, i] as const).filter((p): p is readonly [number, number] => typeof p[0] === 'number');
  if (numeric.length < 2) return new Set();
  const target = best === 'high' ? Math.max(...numeric.map((p) => p[0])) : Math.min(...numeric.map((p) => p[0]));
  return new Set(numeric.filter((p) => p[0] === target).map((p) => p[1]));
}

/** Rows ordered by one column; a missing figure always goes last, whichever way the order runs. */
export function sortRows<T extends Readonly<Record<string, TableCell>>>(rows: readonly T[], key: string, direction: 'asc' | 'desc'): T[] {
  const sign = direction === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const x = a[key] ?? null;
    const y = b[key] ?? null;
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * sign;
    return String(x).localeCompare(String(y)) * sign;
  });
}

export type Point = readonly [number, number];

/** SVG path strings for a line through points, broken wherever a point is missing, so a gap is a gap and not a join. */
export function linePaths(points: readonly (Point | null)[]): string[] {
  const runs: Point[][] = [];
  for (const point of points) {
    if (point === null) {
      runs.push([]);
      continue;
    }
    if (runs.length === 0) runs.push([]);
    runs[runs.length - 1].push(point);
  }
  return runs.filter((run) => run.length > 1).map((run) => run.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' '));
}

// Windowing for the financials table: phones show the latest few periods, with a way to show all.

import type { FinTable } from '@/lib/dashboard/transforms';

export const MOBILE_PERIODS = 4;

/** Keeps the label column and the most recent `count` periods. Returns the same table when nothing is dropped. */
export function recentColumns(table: FinTable, count: number | 'all'): FinTable {
  const periods = table.cols.length - 1;
  if (count === 'all' || periods <= count) return table;
  const drop = periods - count;
  return {
    cols: [table.cols[0], ...table.cols.slice(1 + drop)],
    rows: table.rows.map((r) => ({ label: r.label, cells: r.cells.slice(drop) })),
  };
}

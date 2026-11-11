import { describe, expect, it } from 'vitest';
import type { FinTable } from '@/lib/dashboard/transforms';
import { MOBILE_PERIODS, recentColumns } from './finView';

const table: FinTable = {
  cols: ['', 'Mar 21', 'Mar 22', 'Mar 23', 'Mar 24', 'Mar 25'],
  rows: [
    { label: 'Sales', cells: ['1', '2', '3', '4', '5'] },
    { label: 'Profit', cells: ['a', 'b', 'c', 'd', 'e'] },
  ],
};

describe('recentColumns', () => {
  it('keeps the label column and the last N periods, with matching cells', () => {
    const out = recentColumns(table, 3);
    expect(out.cols).toEqual(['', 'Mar 23', 'Mar 24', 'Mar 25']);
    expect(out.rows[0]).toEqual({ label: 'Sales', cells: ['3', '4', '5'] });
  });
  it('returns the table unchanged for "all" or when N covers every period', () => {
    expect(recentColumns(table, 'all')).toBe(table);
    expect(recentColumns(table, 9)).toBe(table);
  });
  it('does not mutate its input', () => {
    const before = JSON.stringify(table);
    recentColumns(table, 2);
    expect(JSON.stringify(table)).toBe(before);
  });
  it('handles an empty table', () => {
    const empty: FinTable = { cols: [''], rows: [] };
    expect(recentColumns(empty, 3).cols).toEqual(['']);
  });
  it('shows four periods on mobile', () => expect(MOBILE_PERIODS).toBe(4));
});

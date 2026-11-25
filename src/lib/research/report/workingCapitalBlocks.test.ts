import { describe, expect, it } from 'vitest';
import type { LineItemOut } from '@/lib/dashboard/fundamentalsApi';
import { workingCapitalBlocks } from './workingCapitalBlocks';

const row = (label: string, period_end: string, value: string): LineItemOut => ({ label, period_type: 'annual', period_end, value, unit: 'INR_CR', source_tier: 't' });

describe('workingCapitalBlocks', () => {
  const items = [
    row('Debtor Days', '2024-03-31', '130'), row('Debtor Days', '2026-03-31', '164'),
    row('Working Capital Days', '2024-03-31', '54'), row('Working Capital Days', '2026-03-31', '81'),
    row('ROCE %', '2026-03-31', '25'),
  ];
  it('shows the day counts by fiscal year, keeps a missing year as a gap, and leaves out other rows', () => {
    const [table] = workingCapitalBlocks(items);
    if (table.type !== 'data_table') throw new Error();
    expect(table.columns.map((c) => c.label)).toEqual(['', 'FY24', 'FY25', 'FY26']);
    expect(table.rows.map((r) => r.row)).toEqual(['Debtor days', 'Working-capital days']);
    const debtor = table.rows[0];
    expect(debtor['2024-03-31']).toBe(130);
    expect(debtor['2025-03-31']).toBeNull();
    expect(debtor['2026-03-31']).toBe(164);
  });
  it('is empty when the page had none of them', () => {
    expect(workingCapitalBlocks(null)).toEqual([]);
    expect(workingCapitalBlocks([row('ROCE %', '2026-03-31', '25')])).toEqual([]);
    expect(workingCapitalBlocks([{ ...row('Debtor Days', '2026-03-31', ''), value: null }])).toEqual([]);
  });
});

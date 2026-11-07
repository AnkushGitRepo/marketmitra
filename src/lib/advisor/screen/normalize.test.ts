import { describe, expect, it } from 'vitest';
import { normalizeScreenInputs, priceOnOrBefore, type RawLineItem, type RawScreenInputs } from './normalize';

const li = (label: string, period_end: string, value: string | null, period_type = 'annual'): RawLineItem => ({
  label,
  period_end,
  value,
  period_type,
});

const raw: RawScreenInputs = {
  symbol: 'X',
  sector: 'Technology',
  asOf: '2026-11-07',
  profitAndLoss: [
    li('Revenue from Operations', '2026-03-31', '1000'),
    li('Sales', '2025-03-31', '900'),
    li('Net Profit', '2026-03-31', '100'),
    li('Profit Before Tax', '2026-03-31', '140'),
    li('Interest', '2026-03-31', '5'),
    li('EPS in Rs', '2026-03-31', '10'),
    li('Sales', '2026-03-31', '999', 'quarterly'),
    li('Sales', '2024-12-31', '1', 'quarterly'),
  ],
  balanceSheet: [
    li('Borrowings', '2026-03-31', '50'),
    li('Equity Capital', '2026-03-31', '10'),
    li('Reserves', '2026-03-31', '500'),
    li('Borrowings', '2026-09-30', '999'), // half-year row must be ignored
  ],
  cashFlow: [li('Free Cash Flow', '2026-03-31', '70')],
  ratios: [
    { name: 'ROCE', value: '25.0' },
    { name: 'Stock P/E', value: '18.5' },
  ],
  shareholding: [
    { category: 'Promoters', percentage: '60.5', quarter_end: '2026-06-30' },
    { category: 'Promoters', percentage: '61.0', quarter_end: '2026-03-31' },
    { category: 'FIIs', percentage: '10', quarter_end: '2026-06-30' },
  ],
  prices: [
    { trade_date: '2026-03-30', close: '123.5' },
    { trade_date: '2026-03-27', close: '120' },
  ],
};

describe('normalizeScreenInputs', () => {
  const d = normalizeScreenInputs(raw);

  it('keeps only fiscal-year-end rows, newest first', () => {
    expect(d.annual.map((y) => y.periodEnd)).toEqual(['2026-03-31', '2025-03-31']);
  });
  it('maps aliased labels and ignores quarterly rows', () => {
    expect(d.annual[0].sales).toBe(1000);
    expect(d.annual[1].sales).toBe(900);
    expect(d.annual[0].profitBeforeTax).toBe(140);
  });
  it('reads balance sheet, cash flow and prices', () => {
    expect(d.annual[0]).toMatchObject({ borrowings: 50, equityCapital: 10, reserves: 500, freeCashFlow: 70, priceAtYearEnd: 123.5 });
    expect(d.annual[1].borrowings).toBeNull();
  });
  it('reads ratios and promoter history, and never invents pledge', () => {
    expect(d.reportedRocePct).toBe(25);
    expect(d.currentPe).toBe(18.5);
    expect(d.promoter.map((p) => p.pct)).toEqual([60.5, 61]);
    expect(d.promoterPledgePct).toBeNull();
  });
});

describe('priceOnOrBefore', () => {
  it('returns null when the nearest earlier price is more than 10 days away', () => {
    expect(priceOnOrBefore([{ trade_date: '2026-01-01', close: '5' }], '2026-03-31')).toBeNull();
  });
});

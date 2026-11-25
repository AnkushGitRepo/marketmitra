import { describe, expect, it } from 'vitest';
import type { LineItemOut } from '@/lib/dashboard/fundamentalsApi';
import { buildYearFigures, debtToEquity, interestCover, isEmptyYear } from './statements';

const row = (label: string, period_end: string, value: string, period_type = 'annual'): LineItemOut => ({
  label,
  period_type,
  period_end,
  value,
  unit: 'INR_CR',
  source_tier: 't',
});

const pl = [
  row('Sales', '2022-03-31', '1000'),
  row('Sales', '2024-03-31', '1500'),
  row('Sales', '2024-06-30', '999', 'quarterly'),
  row('Net Profit', '2022-03-31', '100'),
  row('Net Profit', '2024-03-31', '200'),
  row('Operating Profit', '2024-03-31', '400'),
  row('Interest', '2024-03-31', '50'),
  row('EPS in Rs', '2024-03-31', '12.5'),
];
const bs = [
  row('Borrowings', '2024-03-31', '300'),
  row('Borrowings', '2024-09-30', '1'),
  row('Equity Capital', '2024-03-31', '100'),
  row('Reserves', '2024-03-31', '500'),
  row('Total Assets', '2024-03-31', '1200'),
];
const cf = [row('Cash from Operating Activity', '2024-03-31', '350'), row('Free Cash Flow', '2024-03-31', '120'), row('CFO/EBITDA', '2024-03-31', '88')];

describe('buildYearFigures', () => {
  const years = buildYearFigures({ profitAndLoss: pl, balanceSheet: bs, cashFlow: cf });

  it('keeps a missing year as an empty gap and uses annual rows only', () => {
    expect(years.map((y) => y.label)).toEqual(['FY22', 'FY23', 'FY24']);
    expect(isEmptyYear(years[1])).toBe(true);
    expect(years[2].sales).toBe(1500);
  });
  it('joins the three statements for a year', () => {
    expect(years[2]).toMatchObject({ netProfit: 200, operatingProfit: 400, interest: 50, eps: 12.5, borrowings: 300, equity: 600, totalAssets: 1200, cfo: 350, fcf: 120, cfoToEbitda: 88 });
  });
  it('leaves a figure null when its statement has nothing for that year', () => {
    expect(years[0]).toMatchObject({ borrowings: null, cfo: null, equity: null });
  });
  it('copes with no data at all', () => {
    expect(buildYearFigures({ profitAndLoss: null, balanceSheet: null, cashFlow: null })).toEqual([]);
  });
});

describe('ratios', () => {
  it('computes debt to equity and interest cover, null when a part is missing', () => {
    expect(debtToEquity({ borrowings: 300, equity: 600 })).toBe(0.5);
    expect(debtToEquity({ borrowings: 300, equity: -5 })).toBeNull();
    expect(debtToEquity({ borrowings: null, equity: 600 })).toBeNull();
    expect(interestCover({ operatingProfit: 400, interest: 50 })).toBe(8);
    expect(interestCover({ operatingProfit: 400, interest: 0 })).toBeNull();
  });
});

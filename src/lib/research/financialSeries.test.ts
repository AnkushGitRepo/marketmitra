import { describe, expect, it } from 'vitest';
import { buildFinancialPeriods, fiscalLabel, formatCroreCompact, niceTicks } from './financialSeries';

describe('fiscalLabel', () => {
  it('names a March year end FY and any other by month', () => {
    expect(fiscalLabel('2026-03-31')).toBe('FY26');
    expect(fiscalLabel('2025-12-31')).toBe('Dec 25');
    expect(fiscalLabel('bad')).toBe('bad');
  });
});

describe('buildFinancialPeriods', () => {
  const annual = [
    { periodEnd: '2024-03-31', sales: 100, operatingProfit: 20 },
    { periodEnd: '2025-03-31', sales: 150, operatingProfit: 30 },
    { periodEnd: '2026-03-31', sales: null, operatingProfit: 45 },
  ];
  it('adds margin and growth on the previous period', () => {
    const [a, b] = buildFinancialPeriods(annual);
    expect(a).toMatchObject({ label: 'FY24', opm: 20, salesGrowth: null });
    expect(b).toMatchObject({ label: 'FY25', opm: 20, salesGrowth: 50 });
  });
  it('leaves a gap, not a zero, when a figure is missing', () => {
    const c = buildFinancialPeriods(annual)[2];
    expect(c.opm).toBeNull();
    expect(c.salesGrowth).toBeNull();
  });
  it('does not divide by zero sales', () => {
    const [x, y] = buildFinancialPeriods([
      { periodEnd: '2025-03-31', sales: 0, operatingProfit: 5 },
      { periodEnd: '2026-03-31', sales: 10, operatingProfit: 5 },
    ]);
    expect(x.opm).toBeNull();
    expect(y.salesGrowth).toBeNull();
  });
  it('keeps a missing year on the axis, empty, and shows no growth across it', () => {
    const periods = buildFinancialPeriods([
      { periodEnd: '2022-03-31', sales: 100, operatingProfit: 10 },
      { periodEnd: '2024-03-31', sales: 150, operatingProfit: 15 },
    ]);
    expect(periods.map((p) => p.label)).toEqual(['FY22', 'FY23', 'FY24']);
    expect(periods[1]).toMatchObject({ sales: null, operatingProfit: null, opm: null, salesGrowth: null });
    expect(periods[2].salesGrowth).toBeNull();
  });
  it('fills several missing years', () => {
    const labels = buildFinancialPeriods([
      { periodEnd: '2021-03-31', sales: 1, operatingProfit: 1 },
      { periodEnd: '2025-03-31', sales: 2, operatingProfit: 1 },
    ]).map((p) => p.label);
    expect(labels).toEqual(['FY21', 'FY22', 'FY23', 'FY24', 'FY25']);
  });
  it('is empty for no periods', () => {
    expect(buildFinancialPeriods([])).toEqual([]);
  });
});

describe('formatCroreCompact', () => {
  it('uses lakh crore, thousand crore and plain crore', () => {
    expect(formatCroreCompact(147_000)).toBe('₹1.47L Cr');
    expect(formatCroreCompact(73_432)).toBe('₹73.4K Cr');
    expect(formatCroreCompact(850)).toBe('₹850 Cr');
    expect(formatCroreCompact(-2_500)).toBe('−₹2.5K Cr');
    expect(formatCroreCompact(null)).toBe('—');
  });
});

describe('niceTicks', () => {
  it('rounds up past the maximum in even steps from zero', () => {
    expect(niceTicks(1_055_780)).toEqual([0, 500_000, 1_000_000, 1_500_000]);
    expect(niceTicks(46)).toEqual([0, 20, 40, 60]);
  });
  it('copes with an empty or zero range', () => {
    expect(niceTicks(0)).toEqual([0, 1]);
  });
});

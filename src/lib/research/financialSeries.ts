// The numbers behind the sales and operating profit chart (#359): fiscal-year labels, margin and growth per
// period, and axis ticks. Pure, so the chart component only draws.

import type { AnnualFigures } from './companyData';

export interface FinancialPeriod {
  readonly periodEnd: string;
  /** "FY26" for a March year-end, else the month and year ("Dec 25"). */
  readonly label: string;
  readonly sales: number | null;
  readonly operatingProfit: number | null;
  /** Operating profit as a percentage of sales. */
  readonly opm: number | null;
  /** Sales growth on the previous period shown, as a percentage. */
  readonly salesGrowth: number | null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MARCH = 3;

/** Indian fiscal years end in March, so 2026-03-31 is FY26; any other year end is named by its month. */
export function fiscalLabel(periodEnd: string): string {
  const [year, month] = periodEnd.split('-');
  if (!year || !month) return periodEnd;
  return Number(month) === MARCH ? `FY${year.slice(2)}` : `${MONTHS[Number(month) - 1] ?? month} ${year.slice(2)}`;
}

const percentOf = (part: number | null, whole: number | null): number | null =>
  part === null || whole === null || whole === 0 ? null : (part / whole) * 100;

/** True when `later` is the same month one year after `earlier`, so growth between them is a year-on-year figure. */
function isNextYear(earlier: string, later: string): boolean {
  const [ey, em] = earlier.split('-');
  const [ly, lm] = later.split('-');
  return Number(ly) - Number(ey) === 1 && em === lm;
}

/** The year-end dates strictly between two annual period ends of the same month, e.g. 2023-03-31 between 2022 and 2024. */
function missingYearEnds(earlier: string, later: string): string[] {
  const [ey, em, ed] = earlier.split('-');
  const [ly, lm] = later.split('-');
  if (em !== lm || !ey || !ly) return [];
  const gap = Number(ly) - Number(ey);
  return gap > 1 ? Array.from({ length: gap - 1 }, (_, i) => `${Number(ey) + i + 1}-${em}-${ed}`) : [];
}

const EMPTY: Pick<FinancialPeriod, 'sales' | 'operatingProfit' | 'opm' | 'salesGrowth'> = { sales: null, operatingProfit: null, opm: null, salesGrowth: null };

/**
 * One entry per fiscal year, oldest first, with its margin and growth. A year missing from the stored data stays on the
 * axis as an empty period, and growth is only given against the year directly before, never across a gap.
 */
export function buildFinancialPeriods(annual: readonly AnnualFigures[]): FinancialPeriod[] {
  const withGaps = annual.flatMap((a, i) => {
    const before = annual[i - 1];
    const gaps = before ? missingYearEnds(before.periodEnd, a.periodEnd).map((end) => ({ periodEnd: end, sales: null, operatingProfit: null })) : [];
    return [...gaps, a];
  });
  return withGaps.map((a, i) => {
    const before = withGaps[i - 1];
    const previous = before && isNextYear(before.periodEnd, a.periodEnd) ? before.sales : null;
    return a.sales === null && a.operatingProfit === null
      ? { periodEnd: a.periodEnd, label: fiscalLabel(a.periodEnd), ...EMPTY }
      : {
          periodEnd: a.periodEnd,
          label: fiscalLabel(a.periodEnd),
          sales: a.sales,
          operatingProfit: a.operatingProfit,
          opm: percentOf(a.operatingProfit, a.sales),
          salesGrowth: a.sales !== null && previous !== null && previous !== 0 ? ((a.sales - previous) / Math.abs(previous)) * 100 : null,
        };
  });
}

/** ₹ crore in the short form the chart labels use: ₹1.47L Cr, ₹73.4K Cr, ₹850 Cr. */
export function formatCroreCompact(value: number | null): string {
  if (value === null) return '—';
  const sign = value < 0 ? '−' : '';
  const abs = Math.abs(value);
  if (abs >= 100_000) return `${sign}₹${(abs / 100_000).toFixed(2)}L Cr`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1)}K Cr`;
  return `${sign}₹${Math.round(abs)} Cr`;
}

/** Round axis ticks from 0 up to just past `max`: about `count` steps of 1, 2, 2.5, 5 or 10 times a power of ten. */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0)) return [0, 1];
  const rough = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rough) ?? 10 * magnitude);
  const ticks: number[] = [];
  for (let t = 0; t < max + step; t += step) ticks.push(Math.round(t * 1e6) / 1e6);
  return ticks;
}

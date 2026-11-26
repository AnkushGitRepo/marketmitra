// The head-to-head report's arithmetic (#394): who leads on each measure, and one shared fiscal-year axis with each company's
// own growth carried forward as a projection. Pure functions of stored figures; a figure the data lacks stays null, and nothing
// here is a forecast from an analyst (the projection says what each company's own history would imply, and fades).

import type { AnnualFigures } from '../companyData';

/** What the data holds about one company in the comparison. */
export interface CompareCompany {
  readonly symbol: string;
  readonly name: string;
  readonly sector: string | null;
  readonly industry: string | null;
  readonly marketCap: number | null;
  readonly pe: number | null;
  readonly pb: number | null;
  readonly roce: number | null;
  readonly roe: number | null;
  readonly debtToEquity: number | null;
  readonly dividendYield: number | null;
  readonly salesCagr3y: number | null;
  readonly profitCagr3y: number | null;
  /** Up to five annual periods, oldest first. */
  readonly annual: readonly AnnualFigures[];
}

export interface Winner {
  readonly category: 'Scale' | 'Profitability and ROCE' | 'Balance-sheet safety' | 'Growth momentum';
  /** Null when no company has the figure. */
  readonly symbol: string | null;
  readonly detail: string;
}

const present = <T>(items: readonly T[], pick: (t: T) => number | null): { item: T; v: number }[] =>
  items.flatMap((item) => {
    const v = pick(item);
    return v === null ? [] : [{ item, v }];
  });

const best = <T>(items: readonly T[], pick: (t: T) => number | null, dir: 'high' | 'low'): { item: T; v: number } | null => {
  const rows = present(items, pick);
  if (rows.length === 0) return null;
  return rows.reduce((a, b) => ((dir === 'high' ? b.v > a.v : b.v < a.v) ? b : a));
};

const f = (v: number, unit: string, digits = 1): string => `${v.toLocaleString('en-IN', { maximumFractionDigits: digits })}${unit}`;

/** A company with a negative net worth (negative P/B or debt to equity) is not "safe" however small its debt ratio looks. */
const hasPositiveNetWorth = (c: CompareCompany): boolean => (c.pb === null || c.pb > 0) && (c.debtToEquity === null || c.debtToEquity >= 0);

/** Who leads on scale, returns, balance sheet and growth: the largest, the highest ROCE, the lowest debt to equity among sound balance sheets, the fastest profit growth. */
export function categoryWinners(companies: readonly CompareCompany[]): Winner[] {
  const scale = best(companies, (c) => c.marketCap, 'high');
  const returns = best(companies, (c) => c.roce, 'high');
  const safe = best(companies.filter(hasPositiveNetWorth), (c) => c.debtToEquity, 'low');
  const growth = best(companies, (c) => c.profitCagr3y ?? c.salesCagr3y, 'high');
  return [
    { category: 'Scale', symbol: scale?.item.symbol ?? null, detail: scale ? `Market cap ₹${f(scale.v, ' crore', 0)}` : 'No market cap in the data' },
    { category: 'Profitability and ROCE', symbol: returns?.item.symbol ?? null, detail: returns ? `ROCE ${f(returns.v, '%')}` : 'No ROCE in the data' },
    { category: 'Balance-sheet safety', symbol: safe?.item.symbol ?? null, detail: safe ? `Debt to equity ${f(safe.v, 'x')}` : 'No company with a sound balance sheet and a debt ratio' },
    {
      category: 'Growth momentum',
      symbol: growth?.item.symbol ?? null,
      detail: growth ? `${growth.item.profitCagr3y !== null ? 'Profit' : 'Sales'} growth ${f(growth.v, '% a year (3y)')}` : 'No growth figure in the data',
    },
  ];
}

/** Companies whose net worth is negative, which the verdict names rather than ranks. */
export const negativeNetWorth = (companies: readonly CompareCompany[]): CompareCompany[] => companies.filter((c) => !hasPositiveNetWorth(c));

export type Metric = 'sales' | 'operatingProfit' | 'indexed';

export interface Trajectory {
  /** Fiscal-year labels, actuals then projections ("FY27E"). */
  readonly labels: readonly string[];
  readonly projectedFrom: number | null;
  /** The label of the year every company's growth index starts from (100), or null when no year is shared and each starts at its own first. */
  readonly indexBase: string | null;
  readonly series: Readonly<Record<Metric, { name: string; values: (number | null)[] }[]>>;
}

const PROJECTED_YEARS = 3;
/** Each projected year grows at this share of the year before it: the company's own pace, fading. */
const FADE = 0.8;
const MAX_GROWTH = 0.3;
const MIN_GROWTH = -0.15;
const MIN_ACTUAL_YEARS = 3;

const yearOf = (periodEnd: string): number => Number(periodEnd.slice(0, 4));
const MARCH = '03';
const isMarch = (periodEnd: string): boolean => periodEnd.slice(5, 7) === MARCH;

/** The compound annual growth over the periods given, or null when it cannot be worked out (a non-positive start or end). */
export function cagr(first: number | null, last: number | null, years: number): number | null {
  if (first === null || last === null || first <= 0 || last <= 0 || years <= 0) return null;
  return (last / first) ** (1 / years) - 1;
}

/** The next years after the last actual, growing at the company's own past rate and fading each year; empty when the history is too short or not positive. */
export function project(actuals: readonly (number | null)[]): number[] {
  const known = actuals.flatMap((v, i) => (v === null ? [] : [{ v, i }]));
  if (known.length < MIN_ACTUAL_YEARS) return [];
  const first = known[0];
  const last = known[known.length - 1];
  const rate = cagr(first.v, last.v, last.i - first.i);
  if (rate === null) return [];
  let growth = Math.min(MAX_GROWTH, Math.max(MIN_GROWTH, rate));
  let value = last.v;
  return Array.from({ length: PROJECTED_YEARS }, () => {
    growth *= FADE;
    value *= 1 + growth;
    return value;
  });
}

const round = (v: number): number => Math.round(v * 10) / 10;

/**
 * Every company on one fiscal-year axis: the years the data holds for any of them (March year ends), then three projected years.
 * A company missing a year has a gap there; a company whose history cannot be projected stops at its last actual.
 */
export function trajectory(companies: readonly CompareCompany[]): Trajectory | null {
  const years = [...new Set(companies.flatMap((c) => c.annual.filter((a) => isMarch(a.periodEnd)).map((a) => yearOf(a.periodEnd))))].sort((a, b) => a - b);
  if (years.length < 2) return null;
  const last = years[years.length - 1];
  const future = Array.from({ length: PROJECTED_YEARS }, (_, i) => last + i + 1);
  const label = (y: number, projected: boolean): string => `FY${String(y).slice(2)}${projected ? 'E' : ''}`;
  const labels = [...years.map((y) => label(y, false)), ...future.map((y) => label(y, true))];

  const line = (c: CompareCompany, pick: (a: AnnualFigures) => number | null): (number | null)[] => {
    const actual = years.map((y) => {
      const a = c.annual.find((x) => yearOf(x.periodEnd) === y && isMarch(x.periodEnd));
      return a ? pick(a) : null;
    });
    const ahead = project(actual);
    // Padded with gaps, so every series is exactly as long as the axis.
    return [...actual, ...Array.from({ length: PROJECTED_YEARS }, (_, i) => ahead[i] ?? null)];
  };
  const mapped = (pick: (a: AnnualFigures) => number | null) => companies.map((c) => ({ name: c.symbol, values: line(c, pick) }));
  const sales = mapped((a) => a.sales);
  const operatingProfit = mapped((a) => a.operatingProfit);
  // The growth index starts every company from the same year, the first one they all have, so the lines can be compared; with no
  // shared year each starts from its own first.
  const common = years.findIndex((_, i) => sales.every((s) => (s.values[i] ?? 0) > 0));
  const indexed = sales.map((s) => {
    const base = common >= 0 ? s.values[common] : (s.values.find((v) => v !== null && v > 0) ?? null);
    return { name: s.name, values: s.values.map((v) => (v === null || base === null || base === 0 ? null : round((v / base) * 100))) };
  });
  const rounded = (rows: { name: string; values: (number | null)[] }[]) => rows.map((r) => ({ name: r.name, values: r.values.map((v) => (v === null ? null : Math.round(v))) }));
  const hasProjection = [...sales, ...operatingProfit].some((s) => s.values.slice(years.length).some((v) => v !== null));
  return { labels, projectedFrom: hasProjection ? years.length : null, indexBase: common >= 0 ? labels[common] : null, series: { sales: rounded(sales), operatingProfit: rounded(operatingProfit), indexed } };
}

export interface Premium {
  readonly symbol: string;
  readonly pe: number | null;
  /** P/E divided by the three-year profit growth in percent; null unless both are positive. */
  readonly peToGrowth: number | null;
  readonly roce: number | null;
}

/** Whether a higher multiple comes with higher growth: P/E against profit growth and ROCE, company by company. */
export function valuationVsGrowth(companies: readonly CompareCompany[]): Premium[] {
  return companies.map((c) => ({
    symbol: c.symbol,
    pe: c.pe,
    peToGrowth: c.pe !== null && c.pe > 0 && c.profitCagr3y !== null && c.profitCagr3y > 0 ? c.pe / c.profitCagr3y : null,
    roce: c.roce,
  }));
}

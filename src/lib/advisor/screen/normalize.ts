import type { AnnualYear, PromoterPoint, ScreenData } from './types';

// Raw API row shapes (a structural subset of the fundamentals-api responses).
export interface RawLineItem {
  label: string;
  period_type: string;
  period_end: string;
  value: string | null;
}
export interface RawRatio {
  name: string;
  value: string | null;
}
export interface RawShareholding {
  category: string;
  percentage: string;
  quarter_end: string;
}
export interface RawPrice {
  trade_date: string;
  close: string | null;
}

export interface RawScreenInputs {
  symbol: string;
  sector: string | null;
  asOf: string;
  profitAndLoss: RawLineItem[];
  balanceSheet: RawLineItem[];
  cashFlow: RawLineItem[];
  ratios: RawRatio[];
  shareholding: RawShareholding[];
  prices: RawPrice[];
}

// The sources spell the same line differently across companies and years.
const ALIASES = {
  sales: ['Sales', 'Revenue from Operations'],
  netProfit: ['Net Profit'],
  profitBeforeTax: ['Profit before tax', 'Profit Before Tax'],
  interest: ['Interest'],
  eps: ['EPS in Rs'],
  borrowings: ['Borrowings'],
  equityCapital: ['Equity Capital'],
  reserves: ['Reserves'],
  freeCashFlow: ['Free Cash Flow'],
} as const;

const toNum = (v: string | null | undefined): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function pick(items: RawLineItem[], aliases: readonly string[], periodEnd: string): number | null {
  for (const label of aliases) {
    const hit = items.find((i) => i.label === label && i.period_end === periodEnd && i.period_type === 'annual');
    const n = toNum(hit?.value);
    if (n !== null) return n;
  }
  return null;
}

/** Closing price on the last trading day on/before `isoDate` (within 10 days). */
export function priceOnOrBefore(prices: RawPrice[], isoDate: string): number | null {
  let best: RawPrice | null = null;
  for (const p of prices) {
    if (p.trade_date <= isoDate && (best === null || p.trade_date > best.trade_date)) best = p;
  }
  if (!best) return null;
  const gapDays = (Date.parse(isoDate) - Date.parse(best.trade_date)) / 86_400_000;
  return gapDays <= 10 ? toNum(best.close) : null;
}

export function normalizeScreenInputs(raw: RawScreenInputs): ScreenData {
  // Fiscal-year-end month = the most common month among annual P&L rows; this
  // drops half-year balance-sheet rows (e.g. a September row among March year-ends).
  const annualEnds = raw.profitAndLoss.filter((i) => i.period_type === 'annual').map((i) => i.period_end);
  const monthCounts = new Map<string, number>();
  for (const d of annualEnds) monthCounts.set(d.slice(5, 7), (monthCounts.get(d.slice(5, 7)) ?? 0) + 1);
  const fyMonth = [...monthCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  const ends = [...new Set(annualEnds)].filter((d) => d.slice(5, 7) === fyMonth).sort().reverse();

  const annual: AnnualYear[] = ends.map((periodEnd) => ({
    periodEnd,
    sales: pick(raw.profitAndLoss, ALIASES.sales, periodEnd),
    netProfit: pick(raw.profitAndLoss, ALIASES.netProfit, periodEnd),
    profitBeforeTax: pick(raw.profitAndLoss, ALIASES.profitBeforeTax, periodEnd),
    interest: pick(raw.profitAndLoss, ALIASES.interest, periodEnd),
    eps: pick(raw.profitAndLoss, ALIASES.eps, periodEnd),
    borrowings: pick(raw.balanceSheet, ALIASES.borrowings, periodEnd),
    equityCapital: pick(raw.balanceSheet, ALIASES.equityCapital, periodEnd),
    reserves: pick(raw.balanceSheet, ALIASES.reserves, periodEnd),
    freeCashFlow: pick(raw.cashFlow, ALIASES.freeCashFlow, periodEnd),
    priceAtYearEnd: priceOnOrBefore(raw.prices, periodEnd),
  }));

  const promoter: PromoterPoint[] = raw.shareholding
    .filter((s) => s.category === 'Promoters')
    .map((s) => ({ quarterEnd: s.quarter_end, pct: Number(s.percentage) }))
    .filter((p) => Number.isFinite(p.pct))
    .sort((a, b) => b.quarterEnd.localeCompare(a.quarterEnd));

  const ratio = (name: string) => toNum(raw.ratios.find((r) => r.name === name)?.value);
  return {
    symbol: raw.symbol,
    sector: raw.sector,
    asOf: raw.asOf,
    annual,
    promoter,
    reportedRocePct: ratio('ROCE'),
    currentPe: ratio('Stock P/E'),
    promoterPledgePct: null,
  };
}

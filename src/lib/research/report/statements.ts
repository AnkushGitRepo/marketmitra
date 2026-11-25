// Five-plus years of a company's statements side by side: P&L, balance sheet and cash flow (#360). Pure: it
// only reshapes what the data service holds, so every figure in a report table is a stored figure.

import type { LineItemOut } from '@/lib/dashboard/fundamentalsApi';
import { fiscalLabel, missingYearEnds } from '../financialSeries';
import { toNumber } from '../formatters';

export interface YearFigures {
  readonly periodEnd: string;
  /** "FY26" for a March year end. */
  readonly label: string;
  readonly sales: number | null;
  readonly operatingProfit: number | null;
  readonly netProfit: number | null;
  readonly interest: number | null;
  /** Earnings per share in rupees. */
  readonly eps: number | null;
  readonly borrowings: number | null;
  /** Total debt including lease obligations, and cash with short-term investments, both from Yahoo (#365). */
  readonly totalDebt: number | null;
  readonly cash: number | null;
  /** Equity capital plus reserves. */
  readonly equity: number | null;
  readonly totalAssets: number | null;
  /** Cash from operating activity. */
  readonly cfo: number | null;
  readonly fcf: number | null;
  /** Operating cash flow as a percentage of operating profit, as the source reports it. */
  readonly cfoToEbitda: number | null;
}

export interface StatementInput {
  readonly profitAndLoss: readonly LineItemOut[] | null;
  readonly balanceSheet: readonly LineItemOut[] | null;
  readonly cashFlow: readonly LineItemOut[] | null;
}

const YEARS = 6;

/** label → (period end → value) for annual rows only; a half-year column such as Sep 2026 is not an annual period. */
function annualByLabel(items: readonly LineItemOut[] | null, label: string): Map<string, number | null> {
  return new Map(
    (items ?? []).filter((i) => i.label === label && i.period_type === 'annual').map((i) => [i.period_end, toNumber(i.value)])
  );
}

/** The annual period ends to show, taken from the P&L (the reference), oldest first, with missing years kept as gaps. */
function periodEnds(pl: readonly LineItemOut[] | null): string[] {
  const ends = [...new Set([...annualByLabel(pl, 'Sales').keys(), ...annualByLabel(pl, 'Net Profit').keys()])].sort().slice(-YEARS);
  return ends.flatMap((end, i) => [...(i > 0 ? missingYearEnds(ends[i - 1], end) : []), end]);
}

const sumOrNull = (a: number | null, b: number | null): number | null => (a === null || b === null ? null : a + b);

export function buildYearFigures(input: StatementInput): YearFigures[] {
  const get = (items: readonly LineItemOut[] | null, label: string) => annualByLabel(items, label);
  const sales = get(input.profitAndLoss, 'Sales');
  const operating = get(input.profitAndLoss, 'Operating Profit');
  const net = get(input.profitAndLoss, 'Net Profit');
  const interest = get(input.profitAndLoss, 'Interest');
  const eps = get(input.profitAndLoss, 'EPS in Rs');
  const borrowings = get(input.balanceSheet, 'Borrowings');
  const capital = get(input.balanceSheet, 'Equity Capital');
  const reserves = get(input.balanceSheet, 'Reserves');
  const assets = get(input.balanceSheet, 'Total Assets');
  const totalDebt = get(input.balanceSheet, 'Total Debt');
  const cash = get(input.balanceSheet, 'Cash and Short-Term Investments');
  const cfo = get(input.cashFlow, 'Cash from Operating Activity');
  const fcf = get(input.cashFlow, 'Free Cash Flow');
  const cfoRatio = get(input.cashFlow, 'CFO/EBITDA');
  const at = (m: Map<string, number | null>, end: string) => m.get(end) ?? null;

  return periodEnds(input.profitAndLoss).map((end) => ({
    periodEnd: end,
    label: fiscalLabel(end),
    sales: at(sales, end),
    operatingProfit: at(operating, end),
    netProfit: at(net, end),
    interest: at(interest, end),
    eps: at(eps, end),
    borrowings: at(borrowings, end),
    totalDebt: at(totalDebt, end),
    cash: at(cash, end),
    equity: sumOrNull(at(capital, end), at(reserves, end)),
    totalAssets: at(assets, end),
    cfo: at(cfo, end),
    fcf: at(fcf, end),
    cfoToEbitda: at(cfoRatio, end),
  }));
}

/** Borrowings over equity, or null when either is missing or equity is not positive. */
export const debtToEquity = (y: Pick<YearFigures, 'borrowings' | 'equity'>): number | null =>
  y.borrowings === null || y.equity === null || y.equity <= 0 ? null : y.borrowings / y.equity;

/** Debt less cash, from Yahoo's two lines so both are measured the same way. Negative means more cash than debt. */
export const netDebt = (y: Pick<YearFigures, 'totalDebt' | 'cash'>): number | null =>
  y.totalDebt === null || y.cash === null ? null : y.totalDebt - y.cash;

/** Operating profit over interest, or null when interest is missing or zero. */
export const interestCover = (y: Pick<YearFigures, 'operatingProfit' | 'interest'>): number | null =>
  y.operatingProfit === null || y.interest === null || y.interest <= 0 ? null : y.operatingProfit / y.interest;

/** True when the year has none of the figures: it is a gap in the stored data. */
export const isEmptyYear = (y: YearFigures): boolean =>
  [y.sales, y.operatingProfit, y.netProfit, y.borrowings, y.cfo].every((v) => v === null);

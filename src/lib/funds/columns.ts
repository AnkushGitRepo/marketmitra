// Column definitions for the Funds results table. `sort` is the service's sort key.

import { formatAum, formatNumber, formatPercent, returnTone, type Tone } from './format';
import type { FundSortKey } from './params';
import type { FundSummary } from './types';

export interface FundColumn {
  readonly key: string;
  readonly label: string;
  /** Present when the column can be sorted by the data service. */
  readonly sort?: FundSortKey;
  /** Short explanation shown as a tooltip on the header. */
  readonly hint: string;
  readonly render: (fund: FundSummary) => { text: string; tone: Tone };
  /** Drop the column when no fund on the page has a figure for it (a source we do not have yet). */
  readonly hideWhenEmpty?: boolean;
  /** Reads the raw figure, for the hide-when-empty check. */
  readonly value?: (fund: FundSummary) => number | null;
}

const pct = (read: (f: FundSummary) => number | null) => (f: FundSummary) => {
  const value = read(f);
  return { text: formatPercent(value), tone: returnTone(value) };
};
const plain = (text: (f: FundSummary) => string) => (f: FundSummary) => ({ text: text(f), tone: 'flat' as const });

export const FUND_COLUMNS: readonly FundColumn[] = [
  { key: 'ret_1y', label: '1Y', sort: 'ret_1y', hint: 'Return over the last year', render: pct((f) => f.ret_1y) },
  { key: 'ret_3y', label: '3Y', sort: 'ret_3y', hint: 'Annualised (CAGR) return over 3 years', render: pct((f) => f.ret_3y) },
  { key: 'ret_5y', label: '5Y', sort: 'ret_5y', hint: 'Annualised (CAGR) return over 5 years', render: pct((f) => f.ret_5y) },
  {
    key: 'sharpe_3y', label: 'Sharpe', sort: 'sharpe_3y',
    hint: 'Return above a 6.5% risk-free rate per unit of volatility, over 3 years. Higher is better.',
    render: plain((f) => formatNumber(f.sharpe_3y)),
  },
  {
    key: 'std_dev_3y', label: 'Volatility', sort: 'std_dev_3y',
    hint: 'Annualised standard deviation of daily returns over 3 years. Lower means a smoother ride.',
    render: plain((f) => (f.std_dev_3y === null ? formatNumber(null) : `${formatNumber(f.std_dev_3y, 1)}%`)),
  },
  {
    key: 'expense_ratio', label: 'Expense', sort: 'expense_ratio',
    hint: 'Total expense ratio charged each year. A dash means it has not been disclosed to us yet.',
    hideWhenEmpty: true,
    value: (f) => f.expense_ratio,
    render: plain((f) => (f.expense_ratio === null ? formatNumber(null) : `${formatNumber(f.expense_ratio)}%`)),
  },
  {
    key: 'aum_cr', label: 'AUM', sort: 'aum_cr',
    hint: 'Assets under management. A dash means it has not been disclosed to us yet.',
    hideWhenEmpty: true,
    value: (f) => f.aum_cr,
    render: plain((f) => formatAum(f.aum_cr)),
  },
];

/** The columns worth showing for these funds: sourced-later columns vanish while nothing fills them. */
export function visibleColumns(funds: readonly FundSummary[]): readonly FundColumn[] {
  if (funds.length === 0) return FUND_COLUMNS;
  return FUND_COLUMNS.filter((c) => !c.hideWhenEmpty || !c.value || funds.some((f) => c.value?.(f) != null));
}

/** Labels for the phone sort control (the desktop table sorts from its headers). */
export const SORT_LABELS: Readonly<Record<FundSortKey, string>> = {
  ret_1m: '1M return',
  ret_3m: '3M return',
  ret_6m: '6M return',
  ret_1y: '1Y return',
  ret_3y: '3Y return',
  ret_5y: '5Y return',
  ret_10y: '10Y return',
  sharpe_3y: 'Sharpe ratio',
  sortino_3y: 'Sortino ratio',
  std_dev_3y: 'Volatility',
  max_drawdown_3y: 'Worst fall',
  sip_xirr_3y: '3Y SIP return',
  sip_xirr_5y: '5Y SIP return',
  expense_ratio: 'Expense ratio',
  aum_cr: 'AUM',
  nav: 'NAV',
  name: 'Name',
};

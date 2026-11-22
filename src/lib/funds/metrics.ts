// The figures shown on a fund page: eight headline cells in a fixed order (so the grid is two balanced
// rows), then further figures in one quiet line. A figure we do not have is left out, never shown as a
// dash. Pure, so it tests without a browser.

import { formatAum, formatDate, formatNumber, formatPercent, returnTone, type Tone } from './format';
import type { FundDetail } from './types';

export interface MetricTile {
  readonly label: string;
  readonly value: string;
  readonly tone?: Tone;
  /** Short plain-language explanation, shown as the tile's tooltip. */
  readonly hint?: string;
  /** A related figure shown small beneath the value (Sortino carries Calmar), so it is not a loose line under the grid. */
  readonly secondary?: { readonly label: string; readonly value: string; readonly hint: string };
}

export interface MetricGrid {
  /** The headline cells, at most eight, in a fixed order: returns and cost first, risk second. */
  readonly primary: readonly MetricTile[];
  /** Everything else we have, shown as a single line of small text rather than more cards. */
  readonly more: readonly MetricTile[];
}

/** The order of the headline cells. Four across: 1Y, 3Y, SIP and cost; then Sharpe, Sortino, volatility, worst fall. */
export const PRIMARY_LABELS = ['1Y return', '3Y CAGR', '3Y SIP', 'Expense ratio', 'Sharpe', 'Sortino', 'Volatility', 'Max drawdown'] as const;

const has = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);
const hasText = (value: string | null | undefined): value is string => typeof value === 'string' && value.trim() !== '';

/** 3-year annualised return over the size of the worst 3-year fall; null unless there was a fall. */
export function calmarRatio(return3y: number | null, maxDrawdown3y: number | null): number | null {
  if (!has(return3y) || !has(maxDrawdown3y) || maxDrawdown3y >= 0) return null;
  return return3y / Math.abs(maxDrawdown3y);
}

const percent = (label: string, value: number | null, hint: string): MetricTile[] =>
  has(value) ? [{ label, value: formatPercent(value), tone: returnTone(value), hint }] : [];
const plain = (label: string, value: string, hint?: string): MetricTile[] => [{ label, value, hint }];

export function metricGrid(fund: FundDetail): MetricGrid {
  const sheet = fund.factsheet;
  const expense = fund.expense_ratio ?? sheet?.expense_ratio ?? null;
  const calmar = calmarRatio(fund.ret_3y, fund.max_drawdown_3y);
  const calmarHint = '3-year annual return divided by the size of the worst fall.';
  // Calmar belongs with the other risk-adjusted ratios: on the Sortino tile when there is one, in the quiet line otherwise.
  const calmarOnSortino = calmar !== null && has(fund.sortino_3y);

  const primary: MetricTile[] = [
    ...percent('1Y return', fund.ret_1y, 'Change in NAV over the last year.'),
    ...percent('3Y CAGR', fund.ret_3y, 'Compound annual rate over three years.'),
    ...percent('3Y SIP', fund.sip_xirr_3y, 'XIRR of a fixed monthly amount over three years.'),
    ...(has(expense) ? plain('Expense ratio', `${formatNumber(expense)}%`, 'Yearly cost charged by the fund, Direct plan.') : []),
    ...(has(fund.sharpe_3y) ? plain('Sharpe', formatNumber(fund.sharpe_3y), 'Return above a 6.5% risk-free rate per unit of risk, over 3 years.') : []),
    ...(has(fund.sortino_3y)
      ? [
          {
            label: 'Sortino',
            value: formatNumber(fund.sortino_3y),
            hint: 'Like Sharpe, counting only downward swings.',
            ...(calmarOnSortino ? { secondary: { label: 'Calmar', value: formatNumber(calmar), hint: calmarHint } } : {}),
          },
        ]
      : []),
    ...(has(fund.std_dev_3y) ? plain('Volatility', `${formatNumber(fund.std_dev_3y, 1)}%`, 'How much the NAV swings, annualised, over 3 years.') : []),
    ...percent('Max drawdown', fund.max_drawdown_3y, 'Largest fall from a peak in the last three years.'),
  ];

  const more: MetricTile[] = [
    ...percent('5Y CAGR', fund.ret_5y, 'Compound annual rate over five years.'),
    ...percent('10Y CAGR', fund.ret_10y, 'Compound annual rate over ten years.'),
    ...percent('5Y SIP', fund.sip_xirr_5y, 'XIRR of a fixed monthly amount over five years.'),
    ...(calmar === null || calmarOnSortino ? [] : plain('Calmar', formatNumber(calmar), calmarHint)),
    ...(has(sheet?.aum_cr) ? plain('AUM', formatAum(sheet.aum_cr)) : []),
    ...(hasText(sheet?.exit_load) ? plain('Exit load', sheet.exit_load) : []),
    ...(hasText(sheet?.fund_manager) ? plain('Fund manager', sheet.fund_manager) : []),
    ...(hasText(sheet?.benchmark) ? plain('Benchmark', sheet.benchmark) : []),
    ...(hasText(sheet?.launch_date) ? plain('Launched', formatDate(sheet.launch_date)) : []),
  ];

  return { primary, more };
}

// The figures shown on a fund page. Only figures that exist are returned: a value we do
// not have is left out, never shown as a dash row. Pure, so it tests without a browser.

import { formatAum, formatDate, formatNumber, formatPercent, returnTone, type Tone } from './format';
import type { FundDetail } from './types';

export interface MetricTile {
  readonly label: string;
  readonly value: string;
  readonly tone?: Tone;
  /** Short plain-language explanation, shown as the tile's tooltip. */
  readonly hint?: string;
}

export interface MetricGroup {
  readonly title: string;
  readonly tiles: readonly MetricTile[];
}

const has = (value: number | null | undefined): value is number => value != null && Number.isFinite(value);
const hasText = (value: string | null | undefined): value is string => typeof value === 'string' && value.trim() !== '';

/** 3-year annualised return over the size of the worst 3-year fall; null unless there was a fall. */
export function calmarRatio(return3y: number | null, maxDrawdown3y: number | null): number | null {
  if (!has(return3y) || !has(maxDrawdown3y) || maxDrawdown3y >= 0) return null;
  return return3y / Math.abs(maxDrawdown3y);
}

function percentTile(label: string, value: number | null, hint?: string): MetricTile[] {
  return has(value) ? [{ label, value: formatPercent(value), tone: returnTone(value), hint }] : [];
}

function plainTile(label: string, value: string, hint?: string): MetricTile[] {
  return [{ label, value, hint }];
}

export function metricTiles(fund: FundDetail): readonly MetricGroup[] {
  const sheet = fund.factsheet;
  const expense = fund.expense_ratio ?? sheet?.expense_ratio ?? null;
  const calmar = calmarRatio(fund.ret_3y, fund.max_drawdown_3y);

  const groups: MetricGroup[] = [
    {
      title: 'Returns',
      tiles: [
        ...percentTile('1 year', fund.ret_1y, 'Change in NAV over the last year.'),
        ...percentTile('3 years p.a.', fund.ret_3y, 'Compound annual rate over three years.'),
        ...percentTile('5 years p.a.', fund.ret_5y, 'Compound annual rate over five years.'),
        ...percentTile('10 years p.a.', fund.ret_10y, 'Compound annual rate over ten years.'),
      ],
    },
    {
      title: 'SIP returns',
      tiles: [
        ...percentTile('3-year SIP', fund.sip_xirr_3y, 'XIRR of a fixed monthly amount over three years.'),
        ...percentTile('5-year SIP', fund.sip_xirr_5y, 'XIRR of a fixed monthly amount over five years.'),
      ],
    },
    {
      title: 'Risk (3 years)',
      tiles: [
        ...(has(fund.std_dev_3y) ? plainTile('Volatility', `${formatNumber(fund.std_dev_3y, 1)}%`, 'How much the NAV swings, annualised.') : []),
        ...(has(fund.sharpe_3y) ? plainTile('Sharpe', formatNumber(fund.sharpe_3y), 'Return above a 6.5% risk-free rate per unit of risk.') : []),
        ...(has(fund.sortino_3y) ? plainTile('Sortino', formatNumber(fund.sortino_3y), 'Like Sharpe, counting only downward swings.') : []),
        ...percentTile('Max drawdown', fund.max_drawdown_3y, 'Largest fall from a peak in the last three years.'),
        ...(calmar === null ? [] : plainTile('Calmar', formatNumber(calmar), '3-year annual return divided by the size of the worst fall.')),
      ],
    },
    {
      title: 'Cost and details',
      tiles: [
        ...(has(expense) ? plainTile('Expense ratio', `${formatNumber(expense)}%`, 'Yearly cost charged by the fund, Direct plan.') : []),
        ...(has(sheet?.aum_cr) ? plainTile('AUM', formatAum(sheet.aum_cr)) : []),
        ...(hasText(sheet?.exit_load) ? plainTile('Exit load', sheet.exit_load) : []),
        ...(hasText(sheet?.fund_manager) ? plainTile('Fund manager', sheet.fund_manager) : []),
        ...(hasText(sheet?.benchmark) ? plainTile('Benchmark', sheet.benchmark) : []),
        ...(hasText(sheet?.launch_date) ? plainTile('Launched', formatDate(sheet.launch_date)) : []),
      ],
    },
  ];
  return groups.filter((group) => group.tiles.length > 0);
}

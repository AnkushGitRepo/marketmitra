// CSV export for the funds list (#310). Pure: the route handler streams the result. Figures are written raw (percent
// as a number, no "%" sign) and an unavailable one is left blank, never zero, so a spreadsheet can sort and chart it.

import { csvCell } from '@/lib/screener/csv';
import type { FundSummary } from './types';

interface FundCsvColumn {
  readonly header: string;
  readonly value: (fund: FundSummary) => string | number | null;
}

export const FUND_CSV_COLUMNS: readonly FundCsvColumn[] = [
  { header: 'Scheme code', value: (f) => f.scheme_code },
  { header: 'Fund', value: (f) => f.name },
  { header: 'Fund house', value: (f) => f.fund_house },
  { header: 'Category', value: (f) => f.category },
  { header: 'Sub-category', value: (f) => f.sub_category },
  { header: 'Plan', value: (f) => f.plan },
  { header: 'Option', value: (f) => f.option },
  { header: 'NAV (INR)', value: (f) => f.nav },
  { header: 'NAV date', value: (f) => f.nav_date },
  { header: '1M return (%)', value: (f) => f.ret_1m },
  { header: '3M return (%)', value: (f) => f.ret_3m },
  { header: '6M return (%)', value: (f) => f.ret_6m },
  { header: '1Y return (%)', value: (f) => f.ret_1y },
  { header: '3Y return (%)', value: (f) => f.ret_3y },
  { header: '5Y return (%)', value: (f) => f.ret_5y },
  { header: '10Y return (%)', value: (f) => f.ret_10y },
  { header: 'Volatility 3Y (%)', value: (f) => f.std_dev_3y },
  { header: 'Sharpe 3Y', value: (f) => f.sharpe_3y },
  { header: 'Sortino 3Y', value: (f) => f.sortino_3y },
  { header: 'Worst 3Y fall (%)', value: (f) => f.max_drawdown_3y },
  { header: 'SIP XIRR 3Y (%)', value: (f) => f.sip_xirr_3y },
  { header: 'SIP XIRR 5Y (%)', value: (f) => f.sip_xirr_5y },
  { header: 'Expense ratio (%)', value: (f) => f.expense_ratio },
  { header: 'AUM (INR Cr)', value: (f) => f.aum_cr },
];

export function fundsToCsv(funds: readonly FundSummary[]): string {
  const lines = [FUND_CSV_COLUMNS.map((c) => csvCell(c.header)).join(',')];
  for (const fund of funds) lines.push(FUND_CSV_COLUMNS.map((c) => csvCell(c.value(fund))).join(','));
  // CRLF per RFC 4180; Excel-friendly.
  return `${lines.join('\r\n')}\r\n`;
}

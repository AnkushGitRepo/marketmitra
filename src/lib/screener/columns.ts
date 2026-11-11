// Result columns and their formatting, shared by the desktop table and the mobile cards. Pure: no I/O.

import { SCREENER_RANGE_FIELDS, type RangeFieldKey, type ScreenerResultRow } from '@/lib/dashboard/screenerSchema';

export interface ResultColumn {
  /** Row field this column shows. Every column is also a sortable filter field except `sector`. */
  readonly key: RangeFieldKey | 'sector' | 'current_price';
  readonly label: string;
  /** Short label for the mobile metric chips. */
  readonly chip: string;
  readonly format: (row: ScreenerResultRow) => string;
}

export function formatNum(value: number | null, opts: { suffix?: string; digits?: number } = {}): string {
  if (value === null) return '—';
  const { suffix = '', digits = 2 } = opts;
  return `${value.toLocaleString('en-IN', { maximumFractionDigits: digits })}${suffix}`;
}

export const RESULT_COLUMNS: readonly ResultColumn[] = [
  { key: 'sector', label: 'Sector', chip: 'SECTOR', format: (r) => r.sector ?? '—' },
  {
    key: 'market_cap',
    label: 'Market cap',
    chip: 'MCAP',
    format: (r) => (r.market_cap === null ? '—' : `₹${formatNum(r.market_cap, { digits: 0 })} Cr`),
  },
  {
    key: 'current_price',
    label: 'Price',
    chip: 'PRICE',
    format: (r) => (r.current_price === null ? '—' : `₹${formatNum(r.current_price)}`),
  },
  { key: 'pe', label: 'P/E', chip: 'P/E', format: (r) => formatNum(r.pe, { suffix: 'x' }) },
  { key: 'pb', label: 'P/B', chip: 'P/B', format: (r) => formatNum(r.pb, { suffix: 'x' }) },
  { key: 'roe', label: 'ROE', chip: 'ROE', format: (r) => formatNum(r.roe, { suffix: '%' }) },
  { key: 'roce', label: 'ROCE', chip: 'ROCE', format: (r) => formatNum(r.roce, { suffix: '%' }) },
  { key: 'dividend_yield', label: 'Div yield', chip: 'DIV', format: (r) => formatNum(r.dividend_yield, { suffix: '%' }) },
  { key: 'debt_to_equity', label: 'Debt/Equity', chip: 'D/E', format: (r) => formatNum(r.debt_to_equity, { suffix: 'x' }) },
  {
    key: 'sales_growth_3y_cagr',
    label: 'Sales growth (3y)',
    chip: 'SALES 3Y',
    format: (r) => formatNum(r.sales_growth_3y_cagr, { suffix: '%' }),
  },
  {
    key: 'profit_growth_3y_cagr',
    label: 'Profit growth (3y)',
    chip: 'PROFIT 3Y',
    format: (r) => formatNum(r.profit_growth_3y_cagr, { suffix: '%' }),
  },
];

export const columnByKey = new Map(RESULT_COLUMNS.map((c) => [c.key, c]));
export const SORTABLE_KEYS: ReadonlySet<string> = new Set(SCREENER_RANGE_FIELDS.map((f) => f.key));

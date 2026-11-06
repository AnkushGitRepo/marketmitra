'use client';

import Link from 'next/link';
import {
  SCREENER_RANGE_FIELDS,
  type RangeFieldKey,
  type ScreenerResultRow,
} from '@/lib/dashboard/screenerSchema';
import { Pagination } from './Pagination';
import styles from './page.module.css';

export interface SortState {
  key: RangeFieldKey;
  dir: 'asc' | 'desc';
}

interface ScreenerResultsProps {
  rows: ScreenerResultRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortState | null;
  loading: boolean;
  csvHref: string;
  onSort: (key: RangeFieldKey) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onClear: () => void;
}

type Column = {
  key: keyof ScreenerResultRow;
  label: string;
  format: (row: ScreenerResultRow) => string;
};

function formatNum(value: number | null, opts: { suffix?: string; digits?: number } = {}): string {
  if (value === null) return '—';
  const { suffix = '', digits = 2 } = opts;
  return `${value.toLocaleString('en-IN', { maximumFractionDigits: digits })}${suffix}`;
}

const COLUMNS: Column[] = [
  { key: 'sector', label: 'Sector', format: (r) => r.sector ?? '—' },
  {
    key: 'market_cap',
    label: 'Market cap',
    format: (r) => (r.market_cap === null ? '—' : `₹${formatNum(r.market_cap, { digits: 0 })} Cr`),
  },
  {
    key: 'current_price',
    label: 'Price',
    format: (r) => (r.current_price === null ? '—' : `₹${formatNum(r.current_price)}`),
  },
  { key: 'pe', label: 'P/E', format: (r) => formatNum(r.pe, { suffix: 'x' }) },
  { key: 'pb', label: 'P/B', format: (r) => formatNum(r.pb, { suffix: 'x' }) },
  { key: 'roe', label: 'ROE', format: (r) => formatNum(r.roe, { suffix: '%' }) },
  { key: 'roce', label: 'ROCE', format: (r) => formatNum(r.roce, { suffix: '%' }) },
  {
    key: 'dividend_yield',
    label: 'Div yield',
    format: (r) => formatNum(r.dividend_yield, { suffix: '%' }),
  },
  {
    key: 'debt_to_equity',
    label: 'Debt/Equity',
    format: (r) => formatNum(r.debt_to_equity, { suffix: 'x' }),
  },
  {
    key: 'sales_growth_3y_cagr',
    label: 'Sales growth (3y)',
    format: (r) => formatNum(r.sales_growth_3y_cagr, { suffix: '%' }),
  },
  {
    key: 'profit_growth_3y_cagr',
    label: 'Profit growth (3y)',
    format: (r) => formatNum(r.profit_growth_3y_cagr, { suffix: '%' }),
  },
];

const SORTABLE = new Set<string>(SCREENER_RANGE_FIELDS.map((f) => f.key));

export function ScreenerResults({
  rows,
  total,
  page,
  pageSize,
  sort,
  loading,
  csvHref,
  onSort,
  onPageChange,
  onPageSizeChange,
  onClear,
}: ScreenerResultsProps) {
  if (total === 0 && !loading) {
    return (
      <div className={styles.emptyCard}>
        <p className={styles.emptyTitle}>No companies match these filters</p>
        <p className={styles.emptyText}>
          Try widening a range or removing a filter. ROE, ROCE, debt and growth filters only match
          companies whose fundamentals have been scraped so far.
        </p>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={onClear}
          style={{ marginTop: 16 }}
        >
          Clear all filters
        </button>
      </div>
    );
  }

  return (
    <>
      <div className={styles.resultsBar}>
        <p className={styles.resultsCount} data-testid="screener-count">
          {total.toLocaleString('en-IN')} {total === 1 ? 'company matches' : 'companies match'}
        </p>
        <a className={styles.btnSecondary} href={csvHref} download data-testid="screener-csv">
          Download CSV
        </a>
      </div>

      <div
        className={`${styles.tableScroll} ${loading ? styles.tableLoading : ''}`}
        aria-busy={loading}
      >
        <table className={styles.table}>
          <thead>
            <tr>
              <th className={`${styles.th} ${styles.thLeft}`}>Company</th>
              {COLUMNS.map((col) => {
                const sortable = SORTABLE.has(col.key);
                const active = sort?.key === col.key;
                return (
                  <th
                    key={col.key}
                    className={`${styles.th} ${styles.thRight} ${sortable ? styles.thSortable : ''}`}
                    aria-sort={
                      active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined
                    }
                    onClick={sortable ? () => onSort(col.key as RangeFieldKey) : undefined}
                  >
                    {col.label}
                    {active ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.symbol} className={styles.row}>
                <td className={styles.rowLabel} style={{ textAlign: 'left' }}>
                  <Link
                    href={`/dashboard/stock/${encodeURIComponent(row.symbol)}`}
                    className={styles.rowLink}
                  >
                    {row.name}
                    <span className={styles.rowSymbol}> · {row.symbol}</span>
                  </Link>
                </td>
                {COLUMNS.map((col) => (
                  <td key={col.key} className={styles.rowCell}>
                    {col.format(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        disabled={loading}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
      />
    </>
  );
}

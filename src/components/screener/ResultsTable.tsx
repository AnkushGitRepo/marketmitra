'use client';

import Link from 'next/link';
import type { RangeFieldKey, ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import { RESULT_COLUMNS, SORTABLE_KEYS } from '@/lib/screener/columns';
import { orderColumns } from '@/lib/screener/view';
import styles from './ResultsTable.module.css';

export interface SortState {
  readonly key: RangeFieldKey;
  readonly dir: 'asc' | 'desc';
}

interface ResultsTableProps {
  readonly rows: readonly ScreenerResultRow[];
  readonly sort: SortState | null;
  /** Columns used by an active filter or the sort: shown next to the company and tinted. */
  readonly highlighted: ReadonlySet<string>;
  readonly loading: boolean;
  readonly onSort: (key: RangeFieldKey) => void;
}

/** Desktop results: sticky header and company column, right-aligned numbers, sort arrows. */
export function ResultsTable({ rows, sort, highlighted, loading, onSort }: ResultsTableProps) {
  const columns = orderColumns(RESULT_COLUMNS, highlighted);

  return (
    <div className={`${styles.scroll} ${loading ? styles.loading : ''}`} aria-busy={loading}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={`${styles.th} ${styles.company}`} scope="col">
              Company
            </th>
            {columns.map((col) => {
              const sortable = SORTABLE_KEYS.has(col.key);
              const active = sort?.key === col.key;
              const hl = highlighted.has(col.key);
              return (
                <th
                  key={col.key}
                  scope="col"
                  className={`${styles.th} ${styles.num} ${hl ? styles.hl : ''}`}
                  aria-sort={active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : undefined}
                >
                  {sortable ? (
                    <button type="button" className={styles.sortBtn} onClick={() => onSort(col.key as RangeFieldKey)}>
                      {col.label}
                      <span className={active ? styles.arrowOn : styles.arrow} aria-hidden="true">
                        {active ? (sort.dir === 'desc' ? '↓' : '↑') : '↕'}
                      </span>
                    </button>
                  ) : (
                    col.label
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.symbol} className={styles.row}>
              <th scope="row" className={`${styles.td} ${styles.company} ${styles.rowHead}`}>
                <Link href={`/stock/${encodeURIComponent(row.symbol)}`} className={styles.link}>
                  {row.name}
                  <span className={styles.symbol}> · {row.symbol}</span>
                </Link>
              </th>
              {columns.map((col) => (
                <td
                  key={col.key}
                  className={`${styles.td} ${col.key === 'sector' ? styles.sector : styles.num} ${highlighted.has(col.key) ? styles.hl : ''}`}
                >
                  {col.format(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

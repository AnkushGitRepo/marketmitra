'use client';

import Link from 'next/link';
import { visibleColumns } from '@/lib/funds/columns';
import { SORT_LABELS } from '@/lib/funds/columns';
import { useCompareSelection, type CompareSelection } from './useCompareSelection';
import type { FundSortKey } from '@/lib/funds/params';
import type { FundSummary } from '@/lib/funds/types';
import styles from './FundsTable.module.css';

export interface FundSort {
  readonly key: FundSortKey;
  readonly dir: 'asc' | 'desc';
}

interface FundsTableProps {
  readonly funds: readonly FundSummary[];
  readonly sort: FundSort | null;
  readonly loading: boolean;
  readonly onSort: (key: FundSortKey) => void;
  readonly onClear: () => void;
}

interface PickBoxProps {
  readonly fund: FundSummary;
  readonly compare: CompareSelection;
}

/** The compare checkbox. A fourth pick is refused, and the box says why. */
function PickBox({ fund, compare }: PickBoxProps) {
  const picked = compare.has(fund.scheme_code);
  const blocked = !picked && compare.isFull;
  return (
    <input
      type="checkbox"
      className={styles.pickBox}
      checked={picked}
      aria-disabled={blocked}
      title={blocked ? 'Three funds are already picked. Remove one to add another.' : undefined}
      aria-label={`Compare ${fund.base_name}`}
      onChange={() => {
        // aria-disabled, not disabled: the box stays focusable so its reason can be read.
        if (!blocked) compare.toggle({ scheme_code: fund.scheme_code, name: fund.base_name });
      }}
    />
  );
}

function fundSubtitle(fund: FundSummary): string {
  return [fund.fund_house.replace(/ Mutual Fund$/, ''), fund.sub_category ?? fund.category].join(
    ' · ',
  );
}

export function FundsTable({ funds, sort, loading, onSort, onClear }: FundsTableProps) {
  const compare = useCompareSelection();
  if (funds.length === 0 && !loading) {
    return (
      <div className={styles.scroll}>
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No funds match these filters</p>
          <p className={styles.emptyText}>
            Loosen a filter, or clear them all. A fund with a dash for a figure is left out when you
            filter on that figure.
          </p>
          <button type="button" className={styles.clearBtn} onClick={onClear}>
            Clear filters
          </button>
        </div>
      </div>
    );
  }

  const columns = visibleColumns(funds);

  const sortKey = sort?.key ?? 'ret_3y';

  return (
    <>
      {/* Phones: a card per fund, because a wide table hides every figure behind a sideways scroll. */}
      <div className={`${styles.cards} ${loading ? styles.loading : ''}`} aria-busy={loading}>
        <div className={styles.sortBar}>
          <label className={styles.sortLabel}>
            <span>Sort by</span>
            <select
              className={styles.sortSelect}
              value={sortKey}
              onChange={(e) => onSort(e.target.value as FundSortKey)}
            >
              {(Object.entries(SORT_LABELS) as [FundSortKey, string][]).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={styles.dirBtn}
            aria-label={`Sorted ${sort?.dir === 'asc' ? 'ascending' : 'descending'}; tap to reverse`}
            onClick={() => onSort(sortKey)}
          >
            {sort?.dir === 'asc' ? '▲' : '▼'}
          </button>
        </div>
        <ul className={styles.cardList}>
          {funds.map((fund) => (
            <li key={fund.scheme_code} className={styles.card}>
              <div className={styles.cardHead}>
                <Link href={`/funds/${fund.scheme_code}`} className={styles.cardName}>
                  {fund.base_name}
                </Link>
                <PickBox fund={fund} compare={compare} />
              </div>
              <span className={styles.sub}>{fundSubtitle(fund)}</span>
              <dl className={styles.metrics}>
                {columns.map((column) => {
                  const { text, tone } = column.render(fund);
                  return (
                    <div key={column.key} className={styles.metric}>
                      <dt>{column.label}</dt>
                      <dd
                        className={tone === 'up' ? styles.up : tone === 'down' ? styles.down : ''}
                      >
                        {text}
                      </dd>
                    </div>
                  );
                })}
              </dl>
            </li>
          ))}
        </ul>
      </div>

      <div className={`${styles.scroll} ${loading ? styles.loading : ''}`} aria-busy={loading}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" className={`${styles.th} ${styles.pickCol}`}>
                <span className={styles.srOnly}>Compare</span>
              </th>
              <th
                scope="col"
                className={`${styles.th} ${styles.fundCol}`}
                aria-sort={
                  sort?.key === 'name'
                    ? sort.dir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : undefined
                }
              >
                <button
                  type="button"
                  className={`${styles.sortBtn} ${sort?.key === 'name' ? styles.sorted : ''}`}
                  onClick={() => onSort('name')}
                >
                  Fund
                  {sort?.key === 'name' && (
                    <span className={styles.arrow}>{sort.dir === 'asc' ? '▲' : '▼'}</span>
                  )}
                </button>
              </th>
              {columns.map((column) => {
                const active = sort?.key === column.sort;
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={styles.th}
                    title={column.hint}
                    aria-sort={
                      active ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : undefined
                    }
                  >
                    <button
                      type="button"
                      className={`${styles.sortBtn} ${active ? styles.sorted : ''}`}
                      aria-describedby={`fund-col-hint-${column.key}`}
                      onClick={() => column.sort && onSort(column.sort)}
                    >
                      {column.label}
                      {active && (
                        <span className={styles.arrow}>{sort?.dir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </button>
                    {/* The tooltip text is also readable by keyboard and screen-reader users. */}
                    <span id={`fund-col-hint-${column.key}`} className={styles.srOnly}>
                      {column.hint}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {funds.map((fund) => (
              <tr key={fund.scheme_code} className={compare.has(fund.scheme_code) ? styles.pickedRow : undefined}>
                <td className={`${styles.td} ${styles.pickCol}`}>
                  <PickBox fund={fund} compare={compare} />
                </td>
                <td className={`${styles.td} ${styles.fundCol}`}>
                  <Link
                    href={`/funds/${fund.scheme_code}`}
                    className={styles.name}
                    title={fund.name}
                  >
                    {fund.base_name}
                  </Link>
                  <span className={styles.sub}>{fundSubtitle(fund)}</span>
                </td>
                {columns.map((column) => {
                  const { text, tone } = column.render(fund);
                  return (
                    <td
                      key={column.key}
                      className={`${styles.td} ${tone === 'up' ? styles.up : tone === 'down' ? styles.down : ''}`}
                    >
                      {text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

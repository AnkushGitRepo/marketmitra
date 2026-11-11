'use client';

import type { RangeFieldKey, ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import { ResultCards } from '@/components/screener/ResultCards';
import { ResultsTable, type SortState } from '@/components/screener/ResultsTable';
import { Pagination } from './Pagination';
import styles from './page.module.css';

export type { SortState };

interface ScreenerResultsProps {
  rows: ScreenerResultRow[];
  total: number;
  page: number;
  pageSize: number;
  sort: SortState | null;
  highlighted: ReadonlySet<string>;
  cardMetrics: readonly RangeFieldKey[];
  loading: boolean;
  csvHref: string;
  onSort: (key: RangeFieldKey) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
  onClear: () => void;
}

export function ScreenerResults({
  rows,
  total,
  page,
  pageSize,
  sort,
  highlighted,
  cardMetrics,
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
          Try widening a range or removing a filter. ROE, ROCE, debt and growth filters only match companies whose
          fundamentals have been scraped so far.
        </p>
        <button type="button" className={styles.btnSecondary} onClick={onClear} style={{ marginTop: 16 }}>
          Clear all filters
        </button>
      </div>
    );
  }

  return (
    <>
      <div className={styles.resultsBar}>
        <p className={styles.resultsCount} data-testid="screener-count" aria-live="polite">
          {total.toLocaleString('en-IN')} {total === 1 ? 'company matches' : 'companies match'}
        </p>
        <a className={styles.btnSecondary} href={csvHref} download data-testid="screener-csv">
          Download CSV
        </a>
      </div>

      <ResultsTable rows={rows} sort={sort} highlighted={highlighted} loading={loading} onSort={onSort} />
      <ResultCards rows={rows} metrics={cardMetrics} highlighted={highlighted} loading={loading} />

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

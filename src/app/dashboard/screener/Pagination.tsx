'use client';

import { PAGE_SIZES, pageCountFor, pageWindow } from './pageMath';
import styles from './page.module.css';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  disabled?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function Pagination({
  page,
  pageSize,
  total,
  disabled,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const pageCount = pageCountFor(total, pageSize);
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <nav className={styles.pagination} aria-label="Results pages">
      <p className={styles.pageSummary} aria-live="polite">
        Showing {from.toLocaleString('en-IN')}–{to.toLocaleString('en-IN')} of{' '}
        {total.toLocaleString('en-IN')}
      </p>

      <div className={styles.pageButtons}>
        <button
          type="button"
          className={styles.pageBtn}
          disabled={disabled || page === 0}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          ‹ Prev
        </button>
        {pageWindow(page, pageCount).map((item, index) =>
          item === 'gap' ? (
            <span key={`gap-${index}`} className={styles.pageGap} aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={`${styles.pageBtn} ${item === page ? styles.pageBtnActive : ''}`}
              disabled={disabled}
              aria-current={item === page ? 'page' : undefined}
              aria-label={`Page ${item + 1}`}
              onClick={() => onPageChange(item)}
            >
              {item + 1}
            </button>
          ),
        )}
        <button
          type="button"
          className={styles.pageBtn}
          disabled={disabled || page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next ›
        </button>
      </div>

      <label className={styles.pageSize}>
        <span>Rows per page</span>
        <select
          className={styles.select}
          value={pageSize}
          disabled={disabled}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </label>
    </nav>
  );
}

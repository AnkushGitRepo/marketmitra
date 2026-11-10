'use client';

import { PAGE_SIZES } from '@/lib/dashboard/ipoFilters';
import { pageCountFor, pageWindow } from '@/app/dashboard/screener/pageMath';
import styles from './page.module.css';

interface IpoPaginationProps {
  /** Zero-based. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function IpoPagination({ page, pageSize, total, onPageChange, onPageSizeChange }: IpoPaginationProps) {
  const pageCount = pageCountFor(total, pageSize);
  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min(total, (page + 1) * pageSize);

  return (
    <nav className={styles.pagination} aria-label="IPO pages">
      <p className={styles.pageSummary} aria-live="polite">
        Showing {from}–{to} of {total}
      </p>

      <div className={styles.pageButtons}>
        <button
          type="button"
          className={styles.pageBtn}
          disabled={page === 0}
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
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          Next ›
        </button>
      </div>

      <label className={styles.pageSize}>
        <span>Per page</span>
        <select className={styles.pageSelect} value={pageSize} onChange={(e) => onPageSizeChange(Number(e.target.value))}>
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

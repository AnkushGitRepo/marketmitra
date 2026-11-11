'use client';

import { useEffect, useRef } from 'react';
import type { ScreenerFacets } from '@/lib/dashboard/screenerSchema';
import type { Draft } from '@/lib/screener/draft';
import { FilterFields, type DraftKey } from './FilterFields';
import styles from './FilterSheet.module.css';

interface FilterSheetProps {
  readonly open: boolean;
  readonly draft: Draft;
  readonly facets: ScreenerFacets;
  readonly industries: readonly string[];
  readonly total: number;
  readonly loading: boolean;
  readonly error: string | null;
  readonly onChange: (key: DraftKey, value: string) => void;
  readonly onClear: () => void;
  readonly onClose: () => void;
}

/** Full-height bottom sheet holding every filter on phones. Changes apply live behind it; the footer shows the running match count. */
export function FilterSheet({ open, draft, facets, industries, total, loading, error, onChange, onClear, onClose }: FilterSheetProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.sheet}
      aria-labelledby="filter-sheet-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <header className={styles.head}>
        <h2 id="filter-sheet-title" className={styles.title}>
          Filters
        </h2>
        <button type="button" className={styles.clear} onClick={onClear}>
          Clear all
        </button>
        <button type="button" className={styles.close} aria-label="Close filters" onClick={onClose}>
          <span aria-hidden="true">✕</span>
        </button>
      </header>
      <div className={styles.body}>
        <FilterFields draft={draft} facets={facets} industries={industries} onChange={onChange} includeBasics />
        {error && (
          <p className={styles.error} role="alert">
            {error}
          </p>
        )}
      </div>
      <footer className={styles.foot}>
        <button type="button" className={styles.show} onClick={onClose}>
          {loading ? 'Updating…' : `Show ${total.toLocaleString('en-IN')} ${total === 1 ? 'company' : 'companies'}`}
        </button>
      </footer>
    </dialog>
  );
}

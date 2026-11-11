'use client';

import { SORT_OPTIONS } from '@/lib/screener/view';
import styles from './MobileActionBar.module.css';

interface MobileActionBarProps {
  readonly activeCount: number;
  readonly sortValue: string;
  readonly onOpenFilters: () => void;
  readonly onSortChange: (value: string) => void;
}

/** Docked above the tab bar on phones: opens the filter sheet and sets the sort order. */
export function MobileActionBar({ activeCount, sortValue, onOpenFilters, onSortChange }: MobileActionBarProps) {
  return (
    <div className={styles.bar} role="toolbar" aria-label="Screener actions">
      <button type="button" className={styles.filters} onClick={onOpenFilters}>
        Filters{activeCount > 0 ? ` (${activeCount} active)` : ''}
      </button>
      <label className={styles.sort}>
        <span className={styles.srOnly}>Sort by</span>
        <select className={styles.select} value={sortValue} onChange={(e) => onSortChange(e.target.value)}>
          {SORT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

'use client';

import type { SearchResultOut } from '@/lib/dashboard/fundamentalsApi';
import { CompanyLogo } from './CompanyLogo';
import styles from './SearchResultsDropdown.module.css';

interface SearchResultsDropdownProps {
  results: SearchResultOut[];
  loading: boolean;
  onSelect: (result: SearchResultOut) => void;
  /** Keyboard-highlighted row (see useSymbolSearch); -1 = none. */
  activeIndex?: number;
  /** When set and nothing matched, shows a "no results" line instead of nothing. */
  query?: string;
}

export function SearchResultsDropdown({ results, loading, onSelect, activeIndex = -1, query }: SearchResultsDropdownProps) {
  if (results.length === 0 && !loading) {
    if (!query?.trim()) return null;
    return (
      <div className={styles.dropdown}>
        <div className={styles.empty}>No NSE company or index matches “{query.trim()}”.</div>
      </div>
    );
  }

  return (
    <div className={styles.dropdown} role="listbox">
      {results.length === 0 && loading && <div className={styles.empty}>Searching…</div>}
      {results.map((result, index) => (
        <button
          key={`${result.type}-${result.symbol}`}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={`${styles.row} ${index === activeIndex ? styles.active : ''}`}
          // Prevents the input from blurring (and this dropdown from
          // closing) before the click actually registers.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onSelect(result)}
        >
          <span className={styles.iconWrap}>
            {result.type === 'company' ? (
              <CompanyLogo symbol={result.symbol} size={18} />
            ) : (
              <span className={styles.indexBadge}>IDX</span>
            )}
          </span>
          <span className={styles.text}>
            <span className={styles.name}>{result.name}</span>
            <span className={styles.symbol}>{result.type === 'company' ? result.symbol : 'Index'}</span>
          </span>
          {(result.sector || result.is_sme) && (
            <span className={styles.chips}>
              {result.is_sme && <span className={styles.chip}>SME</span>}
              {result.sector && <span className={styles.chip}>{result.sector}</span>}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

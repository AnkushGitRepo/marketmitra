'use client';

import { useState } from 'react';
import { SearchResultsDropdown } from '@/components/dashboard-charts/SearchResultsDropdown';
import { useSymbolSearch } from '@/lib/dashboard/useSymbolSearch';
import styles from './page.module.css';

export function MarketsSearchBar() {
  const { query, setQuery, results, loading, selectResult, activeIndex, handleKeyDown } = useSymbolSearch();
  const [focused, setFocused] = useState(false);

  return (
    <div className={styles.searchWrap}>
      <div className={styles.searchBar}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="7" cy="7" r="5" stroke="var(--app-teal-strong)" strokeWidth="1.6" />
          <line x1="10.8" y1="10.8" x2="14.4" y2="14.4" stroke="var(--app-teal-strong)" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          aria-label="Search NSE stocks and indices"
          autoComplete="off"
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search any NSE stock — name, symbol or ISIN — or an index"
          className={styles.searchInput}
        />
      </div>
      {focused && <SearchResultsDropdown
          results={results}
          loading={loading}
          onSelect={selectResult}
          activeIndex={activeIndex}
          query={query}
        />}
    </div>
  );
}

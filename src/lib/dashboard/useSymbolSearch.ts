'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type KeyboardEvent } from 'react';
import type { SearchResultOut } from './fundamentalsApi';

// Search is served from an in-memory index, so a short debounce keeps the
// dropdown feeling instant without a request per keystroke.
const DEBOUNCE_MS = 120;

export function useSymbolSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const trimmedQuery = query.trim();

  useEffect(() => {
    // Nothing to fetch for an empty query — the derived values below
    // (displayResults/displayLoading) already read as empty/idle in that
    // case, so there's no need to reset state here (avoids a
    // setState-in-effect that would otherwise fire on every keystroke back
    // to empty).
    if (trimmedQuery.length === 0) return;

    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: SearchResultOut[]) => {
          setResults(data);
          setActiveIndex(-1);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery]);

  const selectResult = (result: SearchResultOut) => {
    setQuery('');
    setResults([]);
    setOpen(false);
    if (result.type === 'company') {
      router.push(`/dashboard/stock/${result.symbol.toLowerCase()}`);
    } else {
      // Indices are identified by display name (e.g. "NIFTY 50"), not the
      // Yahoo ticker in result.symbol — matches /dashboard/index/[name].
      router.push(`/dashboard/index/${encodeURIComponent(result.name)}`);
    }
  };

  const visibleResults = trimmedQuery.length === 0 ? [] : results;

  // Arrow keys move the highlight, Enter opens it (or the top hit when
  // nothing is highlighted), Escape clears the box.
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (visibleResults.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (i + 1) % visibleResults.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (i <= 0 ? visibleResults.length - 1 : i - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectResult(visibleResults[activeIndex >= 0 ? activeIndex : 0]);
    } else if (event.key === 'Escape') {
      setQuery('');
      setResults([]);
    }
  };

  return {
    activeIndex,
    handleKeyDown,
    query,
    setQuery,
    results: visibleResults,
    loading: trimmedQuery.length === 0 ? false : loading,
    open,
    setOpen,
    selectResult,
  };
}

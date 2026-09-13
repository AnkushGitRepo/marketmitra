'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { SearchResultOut } from './fundamentalsApi';

const DEBOUNCE_MS = 250;

export function useSymbolSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultOut[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

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
        .then((data: SearchResultOut[]) => setResults(data))
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

  return {
    query,
    setQuery,
    results: trimmedQuery.length === 0 ? [] : results,
    loading: trimmedQuery.length === 0 ? false : loading,
    open,
    setOpen,
    selectResult,
  };
}

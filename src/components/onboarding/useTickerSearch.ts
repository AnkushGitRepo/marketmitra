'use client';

import { useEffect, useState } from 'react';
import type { SearchResultOut } from '@/lib/dashboard/fundamentalsApi';

const DEBOUNCE_MS = 150;

/** Debounced NSE symbol search for the quick-add row. Unlike the header search it never navigates; companies only. */
export function useTickerSearch(query: string) {
  const trimmed = query.trim();
  const [results, setResults] = useState<SearchResultOut[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (trimmed.length === 0) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: SearchResultOut[]) => setResults(data.filter((r) => r.type === 'company')))
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmed]);

  return { results: trimmed.length === 0 ? [] : results, loading: trimmed.length === 0 ? false : loading };
}

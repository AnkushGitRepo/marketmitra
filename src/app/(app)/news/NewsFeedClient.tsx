'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { NewsList } from '@/components/dashboard-charts/NewsList';
import type { NewsItem, NewsPage } from '@/lib/dashboard/newsApi';
import styles from './page.module.css';

type Mode = 'all' | 'holdings';

interface NewsFeedClientProps {
  initial: NewsPage;
  holdingSymbols: string[];
}

async function fetchPage(mode: Mode, symbols: string[], cursor: string | null): Promise<NewsPage> {
  const params = new URLSearchParams({ limit: '20' });
  if (mode === 'holdings') params.set('symbols', symbols.join(','));
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`/api/news?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) return { items: [], next_cursor: null };
  return (await res.json()) as NewsPage;
}

export function NewsFeedClient({ initial, holdingSymbols }: NewsFeedClientProps) {
  const [mode, setMode] = useState<Mode>('all');
  const [items, setItems] = useState<NewsItem[]>(initial.items);
  const [cursor, setCursor] = useState<string | null>(initial.next_cursor);
  const [loading, setLoading] = useState(false);

  const canFilterHoldings = holdingSymbols.length > 0;

  const load = useCallback(
    async (nextMode: Mode, nextCursor: string | null, replace: boolean) => {
      setLoading(true);
      try {
        const page = await fetchPage(nextMode, holdingSymbols, nextCursor);
        setItems((prev) => (replace ? page.items : [...prev, ...page.items]));
        setCursor(page.next_cursor);
      } finally {
        setLoading(false);
      }
    },
    [holdingSymbols]
  );

  // Re-load from scratch whenever the mode changes (but not on first mount —
  // `initial` already covers 'all'). A ref, not state, so this doesn't
  // setState in an effect.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    load(mode, null, true);
  }, [mode, load]);

  return (
    <>
      <div className={styles.toggleRow}>
        <button
          type="button"
          className={`${styles.toggle} ${mode === 'all' ? styles.toggleActive : ''}`}
          onClick={() => setMode('all')}
        >
          All markets
        </button>
        <button
          type="button"
          className={`${styles.toggle} ${mode === 'holdings' ? styles.toggleActive : ''}`}
          onClick={() => canFilterHoldings && setMode('holdings')}
          disabled={!canFilterHoldings}
          title={canFilterHoldings ? undefined : 'Add holdings to filter news to your portfolio'}
        >
          My holdings
        </button>
      </div>

      <NewsList
        items={items}
        showSymbols
        emptyText={
          mode === 'holdings'
            ? 'No recent news for your holdings.'
            : 'No news right now — the feed may still be warming up. Check back shortly.'
        }
      />

      {cursor && (
        <button
          type="button"
          className={styles.loadMore}
          onClick={() => load(mode, cursor, false)}
          disabled={loading}
        >
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}

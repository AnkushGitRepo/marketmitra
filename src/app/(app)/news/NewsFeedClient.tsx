'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NewsFilters, type NewsView } from '@/components/news/NewsFilters';
import { StoryCard } from '@/components/news/StoryCard';
import type { NewsItem, NewsPage } from '@/lib/dashboard/newsApi';
import { filterByTopic, pickHero } from '@/lib/news/feed';
import type { NewsTopic } from '@/lib/news/topics';
import styles from './page.module.css';

interface NewsFeedClientProps {
  initial: NewsPage;
  holdingSymbols: string[];
}

const PAGE_SIZE = 50;
/** Stories revealed at a time; more are shown from what is already loaded before another request is made. */
const REVEAL = 20;

async function fetchPage(view: NewsView, symbols: string[], cursor: string | null): Promise<NewsPage> {
  const params = new URLSearchParams({ limit: String(PAGE_SIZE) });
  if (view === 'holdings') params.set('symbols', symbols.join(','));
  if (cursor) params.set('cursor', cursor);
  const res = await fetch(`/api/news?${params.toString()}`, { cache: 'no-store' });
  if (!res.ok) return { items: [], next_cursor: null };
  return (await res.json()) as NewsPage;
}

export function NewsFeedClient({ initial, holdingSymbols }: NewsFeedClientProps) {
  const [view, setView] = useState<NewsView>('all');
  const [topic, setTopic] = useState<NewsTopic | null>(null);
  const [items, setItems] = useState<NewsItem[]>(initial.items);
  const [cursor, setCursor] = useState<string | null>(initial.next_cursor);
  const [loading, setLoading] = useState(false);
  const [visible, setVisible] = useState(REVEAL);
  const [error, setError] = useState<string | null>(null);

  const held = useMemo(() => new Set(holdingSymbols.map((s) => s.toUpperCase())), [holdingSymbols]);

  const load = useCallback(
    async (nextView: NewsView, nextCursor: string | null, replace: boolean) => {
      setLoading(true);
      setError(null);
      try {
        const page = await fetchPage(nextView, holdingSymbols, nextCursor);
        setItems((prev) => (replace ? page.items : [...prev, ...page.items]));
        setCursor(page.next_cursor);
      } catch {
        setError('Could not load the news. Try again in a moment.');
      } finally {
        setLoading(false);
      }
    },
    [holdingSymbols]
  );

  // Reload from scratch when the view changes (not on first mount: `initial` covers "all"). A ref, not state, so this does not setState in an effect body.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    void load(view, null, true);
  }, [view, load]);

  const matching = filterByTopic(items, topic);
  const shown = matching.slice(0, visible);
  const hero = pickHero(shown);
  const rest = hero ? shown.filter((i) => i.url !== hero.url) : shown;
  const hasMoreLoaded = matching.length > visible;

  const showMore = () => {
    if (hasMoreLoaded) setVisible((v) => v + REVEAL);
    else void load(view, cursor, false).then(() => setVisible((v) => v + REVEAL));
  };

  return (
    <>
      <NewsFilters view={view} topic={topic} holdingsCount={holdingSymbols.length} onView={(v) => { setView(v); setVisible(REVEAL); }} onTopic={(t) => { setTopic(t); setVisible(REVEAL); }} />

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {shown.length === 0 ? (
        <p className={styles.empty}>
          {loading
            ? 'Loading…'
            : view === 'holdings'
              ? 'No recent news for your holdings.'
              : topic
                ? 'No stories on this topic in the headlines loaded so far. Try Load more, or pick All.'
                : 'No news right now. The feed may still be warming up. Check back shortly.'}
        </p>
      ) : (
        <ul className={styles.stories}>
          {hero && <StoryCard key={hero.url} item={hero} heldSymbols={held} hero />}
          {rest.map((item) => (
            <StoryCard key={item.url} item={item} heldSymbols={held} />
          ))}
        </ul>
      )}

      {(hasMoreLoaded || cursor) && (
        <button type="button" className={styles.loadMore} onClick={showMore} disabled={loading}>
          {loading ? 'Loading…' : 'Load more'}
        </button>
      )}
    </>
  );
}

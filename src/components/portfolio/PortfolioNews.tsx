'use client';

import { useMemo, useState } from 'react';
import { relativeTime } from '@/components/dashboard-charts/NewsList';
import type { NewsItem } from '@/lib/dashboard/newsApi';
import { filterNews, holdingWeights, linkNews, newsFilterCounts, sentimentLabel, type NewsFilter } from '@/lib/portfolio/newsView';
import { safeHref } from '@/lib/security/safeHref';
import styles from './PortfolioNews.module.css';

interface PortfolioNewsProps {
  readonly items: readonly NewsItem[];
  readonly holdings: readonly { symbol: string; quantity: number; ltp: number | null }[];
}

const CHIPS: readonly { readonly id: NewsFilter; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'high', label: 'High impact' },
  { id: 'bullish', label: 'Bullish' },
  { id: 'bearish', label: 'Bearish' },
];

/** News for the stocks you hold: each story shows which holding it touches and how big that position is, its tone and a derived impact level. */
export function PortfolioNews({ items, holdings }: PortfolioNewsProps) {
  const [filter, setFilter] = useState<NewsFilter>('all');
  const [symbol, setSymbol] = useState<string | null>(null);
  const linked = useMemo(() => linkNews(items, holdingWeights(holdings)), [items, holdings]);
  const counts = newsFilterCounts(linked);
  const symbols = useMemo(() => [...new Set(linked.flatMap((r) => r.holdings.map((h) => h.symbol)))].sort(), [linked]);
  const rows = filterNews(linked, filter, symbol);

  return (
    <div>
      <div className={styles.filters}>
        <div className={styles.chips} role="group" aria-label="Filter news">
          {CHIPS.map((c) => (
            <button key={c.id} type="button" aria-pressed={filter === c.id} className={`${styles.chip} ${filter === c.id ? styles.chipActive : ''}`} onClick={() => setFilter(c.id)}>
              {c.label} ({counts[c.id]})
            </button>
          ))}
        </div>
        {symbols.length > 1 ? (
          <select className={styles.select} aria-label="Filter by holding" value={symbol ?? ''} onChange={(e) => setSymbol(e.target.value || null)}>
            <option value="">All holdings</option>
            {symbols.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : null}
      </div>

      {rows.length === 0 ? (
        <p className={styles.empty}>{linked.length === 0 ? 'No recent news for your current holdings.' : 'No stories match these filters.'}</p>
      ) : (
        <ul className={styles.list}>
          {rows.map(({ item, holdings: held, impact }) => (
            <li key={item.url} className={styles.item}>
              <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer" className={styles.title}>{item.title}</a>
              <p className={styles.meta}>
                {held.slice(0, 3).map((h) => (
                  <span key={h.symbol} className={styles.holding}>{h.symbol} · {h.weightPct.toFixed(1)}%</span>
                ))}
                <span className={`${styles.tone} ${styles[`tone_${item.sentiment}`]}`}>{sentimentLabel(item.sentiment, impact)}</span>
                <span className={styles.src}>{item.source} · {relativeTime(item.published_at)}</span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

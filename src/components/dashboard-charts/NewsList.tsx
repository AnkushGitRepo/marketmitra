import type { NewsItem, NewsSentiment } from '@/lib/dashboard/newsApi';
import styles from './NewsList.module.css';
import { safeHref } from '@/lib/security/safeHref';

const SENTIMENT_TITLE: Record<NewsSentiment, string> = {
  positive: 'Positive headline tone',
  neutral: 'Neutral headline tone',
  negative: 'Negative headline tone',
};

function relativeTime(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 3600) return `${Math.max(1, Math.round(secs / 60))}m ago`;
  const hrs = Math.round(secs / 3600);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

interface NewsListProps {
  items: NewsItem[];
  /** Show the per-item symbol tags (useful on the global feed, redundant on a stock page). */
  showSymbols?: boolean;
  emptyText?: string;
}

export function NewsList({ items, showSymbols = false, emptyText = 'No news yet.' }: NewsListProps) {
  if (items.length === 0) {
    return <p className={styles.empty}>{emptyText}</p>;
  }

  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.url} className={styles.item}>
          <span
            className={`${styles.dot} ${styles[`dot_${item.sentiment}`]}`}
            title={SENTIMENT_TITLE[item.sentiment]}
            role="img"
            aria-label={SENTIMENT_TITLE[item.sentiment]}
          />
          <div className={styles.body}>
            <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer" className={styles.title}>
              {item.title}
            </a>
            <p className={styles.meta}>
              <span>{item.source}</span>
              <span className={styles.sep}>·</span>
              <span>{relativeTime(item.published_at)}</span>
              {showSymbols &&
                item.symbols.slice(0, 4).map((s) => (
                  <span key={s} className={styles.tag}>
                    {s}
                  </span>
                ))}
            </p>
          </div>
        </li>
      ))}
    </ul>
  );
}

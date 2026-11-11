import Link from 'next/link';
import type { TrendingTicker } from '@/lib/news/feed';
import styles from './TrendingTickers.module.css';

export interface TrendingRow extends TrendingTicker {
  /** Live day change in percent, when a quote was available. */
  readonly changePct: number | null;
}

/** The most-mentioned tickers today with their day change: a card on desktop, a swipeable pill bar on phones. */
export function TrendingTickers({ rows }: { readonly rows: readonly TrendingRow[] }) {
  return (
    <section className={styles.root} aria-label="Trending tickers">
      <h2 className={styles.title}>Trending tickers today</h2>
      {rows.length === 0 ? (
        <p className={styles.empty}>No ticker is tagged in today&rsquo;s headlines yet.</p>
      ) : (
        <ol className={styles.list}>
          {rows.map((r, i) => {
            const up = r.changePct !== null && r.changePct >= 0;
            return (
              <li key={r.symbol} className={styles.item}>
                <Link href={`/stock/${encodeURIComponent(r.symbol.toLowerCase())}`} className={styles.link}>
                  <span className={styles.rank} aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className={styles.main}>
                    <span className={styles.symbol}>{r.symbol}</span>
                    <span className={styles.count}>
                      {r.count} {r.count === 1 ? 'story' : 'stories'}
                    </span>
                  </span>
                  {r.changePct !== null && (
                    <span className={`${styles.change} ${up ? styles.up : styles.down}`}>
                      <span aria-hidden="true">{up ? '▲' : '▼'}</span> {up ? '+' : ''}
                      {r.changePct.toFixed(2)}%
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

import Link from 'next/link';
import type { ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import { columnByKey } from '@/lib/screener/columns';
import type { RangeFieldKey } from '@/lib/dashboard/screenerSchema';
import styles from './ResultCards.module.css';

interface ResultCardsProps {
  readonly rows: readonly ScreenerResultRow[];
  /** The four metrics to show, screened ones first. */
  readonly metrics: readonly RangeFieldKey[];
  readonly highlighted: ReadonlySet<string>;
  readonly loading: boolean;
}

/** Phone results: one compact card per company, with the screened values visible instead of a clipped table. */
export function ResultCards({ rows, metrics, highlighted, loading }: ResultCardsProps) {
  return (
    <ul className={`${styles.list} ${loading ? styles.loading : ''}`} aria-busy={loading}>
      {rows.map((row) => (
        <li key={row.symbol} className={styles.card}>
          <Link href={`/stock/${encodeURIComponent(row.symbol)}`} className={styles.link}>
            <div className={styles.top}>
              <div className={styles.title}>
                <p className={styles.name}>{row.name}</p>
                <p className={styles.symbol}>{row.symbol}</p>
              </div>
              {row.sector && <span className={styles.sector}>{row.sector}</span>}
            </div>
            <p className={styles.price}>
              {row.current_price === null ? '—' : `₹${row.current_price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`}
            </p>
            <dl className={styles.metrics}>
              {metrics.map((key) => {
                const col = columnByKey.get(key);
                if (!col) return null;
                return (
                  <div key={key} className={`${styles.metric} ${highlighted.has(key) ? styles.hl : ''}`}>
                    <dt>{col.chip}</dt>
                    <dd>{col.format(row)}</dd>
                  </div>
                );
              })}
            </dl>
          </Link>
        </li>
      ))}
    </ul>
  );
}

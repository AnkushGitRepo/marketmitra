import { metricGrid } from '@/lib/funds/metrics';
import type { FundDetail } from '@/lib/funds/types';
import styles from './MetricsStrip.module.css';

/** Eight headline figures in two balanced rows, then the rest on one line. A figure we do not have is simply absent. */
export function MetricsStrip({ fund }: { readonly fund: FundDetail }) {
  const { primary, more } = metricGrid(fund);
  if (primary.length === 0 && more.length === 0) {
    return <p className={styles.none}>No performance figures are stored for this fund yet.</p>;
  }
  return (
    <section className={styles.strip} aria-label="Performance and risk">
      {primary.length > 0 && (
        <dl className={styles.grid}>
          {primary.map((tile) => (
            <div key={tile.label} className={styles.tile} title={tile.hint}>
              <dt className={styles.label}>{tile.label}</dt>
              <dd className={`${styles.value} ${tile.tone === 'up' ? styles.up : tile.tone === 'down' ? styles.down : ''}`}>{tile.value}</dd>
              {tile.secondary && (
                <dd className={styles.secondary} title={tile.secondary.hint}>
                  {tile.secondary.label} <span>{tile.secondary.value}</span>
                </dd>
              )}
            </div>
          ))}
        </dl>
      )}
      {more.length > 0 && (
        <dl className={styles.more}>
          {more.map((tile) => (
            <div key={tile.label} className={styles.moreItem} title={tile.hint}>
              <dt>{tile.label}</dt>
              <dd className={tile.tone === 'up' ? styles.up : tile.tone === 'down' ? styles.down : undefined}>{tile.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className={styles.hint}>
        Under a year is the plain change in NAV; longer is the compound annual rate. Sharpe and Sortino use a 6.5% risk-free rate. All
        calculated by us from daily NAV.
      </p>
    </section>
  );
}

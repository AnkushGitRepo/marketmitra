import { metricTiles } from '@/lib/funds/metrics';
import type { FundDetail } from '@/lib/funds/types';
import styles from './MetricsStrip.module.css';

/** Every figure we have for the fund, in groups; a figure we do not have is simply absent. */
export function MetricsStrip({ fund }: { readonly fund: FundDetail }) {
  const groups = metricTiles(fund);
  if (groups.length === 0) {
    return <p className={styles.none}>No performance figures are stored for this fund yet.</p>;
  }
  return (
    <section className={styles.strip} aria-label="Performance and risk">
      {groups.map((group) => (
        <div key={group.title} className={styles.group}>
          <h2 className={styles.title}>{group.title}</h2>
          <dl className={styles.tiles}>
            {group.tiles.map((tile) => (
              <div key={tile.label} className={styles.tile} title={tile.hint}>
                <dt className={styles.label}>{tile.label}</dt>
                <dd className={`${styles.value} ${tile.tone === 'up' ? styles.up : tile.tone === 'down' ? styles.down : ''}`}>{tile.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
      <p className={styles.hint}>
        Under a year is the plain change in NAV; longer is the compound annual rate. Sharpe and Sortino use a 6.5% risk-free rate. All
        calculated by us from daily NAV.
      </p>
    </section>
  );
}

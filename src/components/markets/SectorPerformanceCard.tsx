import { sectorBarScale, type SectorMove } from '@/lib/markets/marketPulse';
import styles from './SectorPerformanceCard.module.css';

const signed = (n: number): string => `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;

/** Today's move in each NSE sectoral index, best first, as diverging bars from a centre line. */
export function SectorPerformanceCard({ sectors }: { readonly sectors: readonly SectorMove[] }) {
  const scale = sectorBarScale(sectors);

  return (
    <section className={styles.card} aria-label="Sector performance">
      <h2 className={styles.title}>Sector performance</h2>
      {sectors.length === 0 ? (
        <p className={styles.empty}>Sector data is unavailable right now.</p>
      ) : (
        <ul className={styles.list}>
          {sectors.map((s) => {
            const up = s.changePct >= 0;
            const width = `${(Math.abs(s.changePct) / scale) * 50}%`;
            return (
              <li key={s.label} className={styles.row}>
                <span className={styles.label}>{s.label}</span>
                <span className={styles.track} aria-hidden="true">
                  <span className={styles.axis} />
                  <span className={up ? styles.barUp : styles.barDown} style={{ width }} />
                </span>
                <span className={`${styles.value} ${up ? styles.up : styles.down}`}>{signed(s.changePct)}</span>
              </li>
            );
          })}
        </ul>
      )}
      <p className={styles.note}>NSE sectoral indices, live.</p>
    </section>
  );
}

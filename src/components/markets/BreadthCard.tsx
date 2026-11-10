import type { Breadth } from '@/lib/markets/marketPulse';
import styles from './BreadthCard.module.css';

const pct = (part: number, total: number): number => (total > 0 ? (part / total) * 100 : 0);

/** Advances / declines across the NIFTY 50 constituents that reported, with a proportional bar. Labelled so it never claims to be the whole market. */
export function BreadthCard({ breadth }: { readonly breadth: Breadth | null }) {
  return (
    <section className={styles.card} aria-label="NIFTY 50 market breadth">
      <div className={styles.head}>
        <h2 className={styles.title}>NIFTY 50 breadth</h2>
        {breadth && <span className={styles.meta}>{breadth.total} of 50 reporting</span>}
      </div>
      {breadth ? (
        <>
          <div className={styles.counts}>
            <span className={styles.adv}>
              <span aria-hidden="true">▲</span> {breadth.advances} advancing
            </span>
            <span className={styles.unch}>{breadth.unchanged} flat</span>
            <span className={styles.dec}>
              <span aria-hidden="true">▼</span> {breadth.declines} declining
            </span>
          </div>
          <div
            className={styles.bar}
            role="img"
            aria-label={`${breadth.advances} advancing, ${breadth.unchanged} unchanged, ${breadth.declines} declining`}
          >
            <span className={styles.barAdv} style={{ width: `${pct(breadth.advances, breadth.total)}%` }} />
            <span className={styles.barFlat} style={{ width: `${pct(breadth.unchanged, breadth.total)}%` }} />
            <span className={styles.barDec} style={{ width: `${pct(breadth.declines, breadth.total)}%` }} />
          </div>
          <p className={styles.ratio}>
            {breadth.ratio === null ? 'No decliners' : `Advance / decline ratio ${breadth.ratio.toFixed(2)}`}
          </p>
        </>
      ) : (
        <p className={styles.empty}>Breadth is unavailable right now. Live constituent prices did not load.</p>
      )}
    </section>
  );
}

import { STOCK_DATA_GAPS, valuationSensitivity } from '@/lib/stock/sensitivity';
import { NOT_AVAILABLE } from '@/lib/stock/signalFormat';
import type { StockSignals } from '@/lib/stock/signals';
import styles from './SensitivityCard.module.css';

/** What today's valuation assumes, as plain arithmetic on figures we hold. Needs no AI key and no generation. */
export function SensitivityCard({ signals }: { readonly signals: StockSignals }) {
  const lines = valuationSensitivity(signals);
  return (
    <section className={styles.card} aria-label="Valuation sensitivity check">
      <h3 className={styles.title}>Valuation sensitivity check</h3>
      <p className={styles.sub}>Arithmetic on the figures we hold. It is not a forecast and not advice.</p>
      <dl className={styles.list}>
        {lines.map((l) => (
          <div key={l.key} className={styles.row}>
            <dt className={styles.label}>{l.label}</dt>
            <dd className={l.value === NOT_AVAILABLE ? styles.na : styles.value}>{l.value}</dd>
            <dd className={styles.note}>{l.note}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.gaps}>Not in our data, so not assessed: {STOCK_DATA_GAPS.join(', ')}.</p>
    </section>
  );
}

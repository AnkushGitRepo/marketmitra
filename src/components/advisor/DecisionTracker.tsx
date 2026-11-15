import Link from 'next/link';
import type { AnalystState, RuleStatus, TrackerRow } from '@/lib/advisor/diagnostics/tracker';
import styles from './advisor.module.css';

const STATUS_LABEL: Record<RuleStatus, (r: TrackerRow) => string> = {
  review: () => 'Thesis review',
  drawdown: () => 'Drawdown over 30%',
  overweight: (r) => `Over cap (${r.weightPct.toFixed(1)}%)`,
  within: () => 'Within limits',
};
const STATUS_CLASS: Record<RuleStatus, string> = {
  review: styles.pillOver,
  drawdown: styles.pillWatch,
  overweight: styles.pillWatch,
  within: '',
};
const ANALYST_LABEL: Record<AnalystState, string> = { ready: 'View dossier', preparing: 'Preparing', none: 'No analyst' };

const price = (n: number | null) => (n === null ? '–' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);

/** Built from the holdings, their analysts and your limits, so nothing is entered by hand. */
export function DecisionTracker({ rows }: { rows: readonly TrackerRow[] }) {
  return (
    <section className={styles.card} aria-labelledby="track-h">
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>Decision tracker · synced from holdings</p>
          <h2 id="track-h" className={styles.h2}>What you paid, what it is now, and what your rules say</h2>
        </div>
        <Link href="/advisor/journal" className={styles.btnGhost}>+ Log a decision</Link>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table className={styles.table}>
          <thead>
            <tr><th>Stock</th><th>Avg cost</th><th>Now</th><th>Return</th><th>Rules</th><th>Analyst</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol}>
                <td><Link href={`/stock/${r.symbol}`}>{r.symbol}</Link></td>
                <td>{price(r.avgPrice)}</td>
                <td>{price(r.ltp)}</td>
                <td>{r.returnPct === null ? '–' : `${r.returnPct > 0 ? '+' : ''}${r.returnPct.toFixed(1)}%`}</td>
                <td><span className={`${styles.pill} ${STATUS_CLASS[r.status]}`}>{STATUS_LABEL[r.status](r)}</span></td>
                <td>{r.analyst === 'none' ? ANALYST_LABEL.none : <Link href="/agents">{ANALYST_LABEL[r.analyst]}</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

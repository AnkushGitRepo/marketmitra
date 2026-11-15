import Link from 'next/link';
import type { ThesisStatus, TrackerRow } from '@/lib/advisor/diagnostics/tracker';
import styles from './advisor.module.css';

const THESIS_LABEL: Record<ThesisStatus, string> = {
  intact: 'Criteria clear',
  review: 'Review needed',
  pending: 'Analyst preparing',
  none: 'No analyst',
};

const price = (n: number | null) => (n === null ? '–' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`);

/** Built from the holdings and their analysts, so nothing is entered by hand. */
export function DecisionTracker({ rows }: { rows: readonly TrackerRow[] }) {
  return (
    <section className={styles.card} aria-labelledby="track-h">
      <p className={styles.eyebrow}>Decision tracker · synced from holdings</p>
      <h2 id="track-h" className={styles.h2}>What you paid, what it is now, and whether its thesis criteria still hold</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className={styles.table}>
          <thead>
            <tr><th>Stock</th><th>Avg cost</th><th>Now</th><th>Return</th><th>Thesis</th></tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} className={r.thesis === 'review' ? styles.losing : undefined}>
                <td><Link href={`/stock/${r.symbol}`}>{r.symbol}</Link></td>
                <td>{price(r.avgPrice)}</td>
                <td>{price(r.ltp)}</td>
                <td>{r.returnPct === null ? '–' : `${r.returnPct > 0 ? '+' : ''}${r.returnPct.toFixed(1)}%`}</td>
                <td>{r.thesis === 'none' ? THESIS_LABEL[r.thesis] : <Link href="/agents">{THESIS_LABEL[r.thesis]}</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

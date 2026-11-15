import type { LimitRow } from '@/lib/advisor/diagnostics/audit';
import styles from './advisor.module.css';

interface Props {
  title: string;
  rows: readonly LimitRow[];
  /** How many rows to show; rows over their limit are always shown. */
  max?: number;
}

const FILL = { ok: '', near: styles.barFillNear, over: styles.barFillOver } as const;
const SCALE_HEADROOM = 1.25;

/** Actual weight against the limit; the marker is the limit and the bar is what you hold. */
export function LimitBars({ title, rows, max = 6 }: Props) {
  const shown = rows.filter((r, i) => i < max || r.status === 'over');
  const scale = Math.max(1, ...shown.map((r) => Math.max(r.pct, r.limitPct))) * SCALE_HEADROOM;
  return (
    <div>
      <h3 className={styles.h2}>{title}</h3>
      {shown.length === 0 && <p className={styles.muted}>Nothing to show yet.</p>}
      {shown.map((r) => (
        <div key={r.name} className={styles.barRow}>
          <span className={styles.barName} title={r.name}>{r.name}</span>
          <span className={styles.barTrack} role="img" aria-label={`${r.name} ${r.pct.toFixed(1)} percent against a ${r.limitPct} percent limit`}>
            <span className={`${styles.barFill} ${FILL[r.status]}`} style={{ width: `${(r.pct / scale) * 100}%` }} />
            <span className={styles.barLimit} style={{ left: `${(r.limitPct / scale) * 100}%` }} />
          </span>
          <span className={styles.barValue}>{r.pct.toFixed(1)}% / {r.limitPct}%</span>
        </div>
      ))}
    </div>
  );
}

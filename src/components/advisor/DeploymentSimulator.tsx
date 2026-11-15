'use client';

import { useMemo, useState } from 'react';
import { simulateDeployment } from '@/lib/advisor/diagnostics/deployment';
import type { Limits, Target } from '@/lib/advisor/diagnostics/profiles';
import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import styles from './advisor.module.css';

interface Props {
  holdings: readonly HoldingLike[];
  limits: Limits;
  target: Target;
}

const DEFAULT_AMOUNT = 10000;
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function DeploymentSimulator({ holdings, limits, target }: Props) {
  const [raw, setRaw] = useState(String(DEFAULT_AMOUNT));
  const amount = Number(raw) > 0 ? Number(raw) : 0;
  const view = useMemo(() => simulateDeployment({ holdings, amountINR: amount, limits, target }), [holdings, amount, limits, target]);
  const hasDetail = view.gaps.length > 0 || view.room.length > 0;

  return (
    <section className={styles.card} aria-labelledby="deploy-h">
      <p className={styles.eyebrow}>Fresh money</p>
      <h2 id="deploy-h" className={styles.h2}>How would my next money split by my target?</h2>
      <div className={styles.formRow}>
        <label className={styles.fieldLabel} htmlFor="deploy-amt">Amount (₹)</label>
        <input id="deploy-amt" className={`${styles.input} ${styles.narrow}`} type="number" min={0} step={1000} inputMode="numeric" value={raw} onChange={(e) => setRaw(e.target.value)} />
      </div>

      {view.sleeves.length > 0 && (
        <ul className={styles.sleeveGrid}>
          {view.sleeves.map((s) => (
            <li key={s.label} className={styles.sleeve}>
              <span className={styles.tag}>{s.label}</span>
              <span className={styles.sleeveAmount}>{inr(s.amountINR)}</span>
              <span className={styles.lineRule}>{Math.round((s.amountINR / amount) * 100)}% of the amount</span>
            </li>
          ))}
        </ul>
      )}

      {hasDetail && (
        <details className={styles.cites}>
          <summary>
            Show how this sits against your limits
            {view.gaps.length > 0 ? ` (${view.gaps.length} over)` : ''}
          </summary>
          {view.gaps.length > 0 && <ul className={styles.claims}>{view.gaps.map((g) => <li key={`${g.kind}-${g.name}`} className={styles.claim}>{g.text}</li>)}</ul>}
          {view.room.length > 0 && (
            <p className={styles.note}>Sectors with room: {view.room.map((r) => `${r.sector} (up to ${inr(r.roomINR)})`).join(', ')}.</p>
          )}
        </details>
      )}
      <p className={styles.note}>New money only: nothing needs a sale.</p>
    </section>
  );
}

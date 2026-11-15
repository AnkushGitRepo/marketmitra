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

  return (
    <section className={styles.card} aria-labelledby="deploy-h">
      <p className={styles.eyebrow}>Fresh money</p>
      <h2 id="deploy-h" className={styles.h2}>Where could my next money sit against my limits?</h2>
      <div className={styles.formRow}>
        <label className={styles.fieldLabel} htmlFor="deploy-amt">Amount (₹)</label>
        <input id="deploy-amt" className={`${styles.input} ${styles.narrow}`} type="number" min={0} step={1000} inputMode="numeric" value={raw} onChange={(e) => setRaw(e.target.value)} />
      </div>
      <p className={styles.muted}>New money only: nothing here needs a sale. It is arithmetic on your own limits, not a recommendation to act.</p>

      {view.sleeves.length > 0 && (
        <ul className={styles.lines}>
          {view.sleeves.map((s) => (
            <li key={s.label} className={styles.line}>
              <span className={styles.tag}>Split</span>
              <span className={styles.lineTarget}>{s.label}</span>
              <span className={styles.lineAmount}>{inr(s.amountINR)}</span>
              <span className={styles.lineRule}>{s.rule}</span>
            </li>
          ))}
        </ul>
      )}

      {view.gaps.length > 0 && (
        <>
          <h3 className={styles.h2}>Over a limit today</h3>
          <ul className={styles.claims}>{view.gaps.map((g) => <li key={`${g.kind}-${g.name}`} className={styles.claim}>{g.text}</li>)}</ul>
        </>
      )}
      {view.room.length > 0 && (
        <>
          <h3 className={styles.h2}>Room under your sector limit</h3>
          <ul className={styles.claims}>
            {view.room.map((r) => <li key={r.sector} className={styles.claim}>{r.sector}: up to {inr(r.roomINR)} before it reaches the limit.</li>)}
          </ul>
        </>
      )}
      {view.notes.map((n) => <p key={n} className={styles.note}>{n}</p>)}
    </section>
  );
}

'use client';

import { useMemo, useState } from 'react';
import { stressTest } from '@/lib/advisor/diagnostics/stress';
import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import styles from './advisor.module.css';

interface Props {
  holdings: readonly HoldingLike[];
  tolerancePct: number;
}

const FALLS = [10, 15, 25] as const;
const WHOLE_MARKET = '';
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function StressTester({ holdings, tolerancePct }: Props) {
  const [fall, setFall] = useState<number>(15);
  const [sector, setSector] = useState(WHOLE_MARKET);
  const sectors = useMemo(() => [...new Set(holdings.map((h) => h.sector).filter((s): s is string => s !== null))].sort(), [holdings]);
  const result = useMemo(
    () => stressTest(holdings, sector === WHOLE_MARKET ? { kind: 'market', fallPct: fall } : { kind: 'sector', sector, fallPct: fall }, tolerancePct),
    [holdings, fall, sector, tolerancePct],
  );

  return (
    <section className={styles.card} aria-labelledby="stress-h">
      <p className={styles.eyebrow}>What if</p>
      <h2 id="stress-h" className={styles.h2}>If prices fall, how much would I lose?</h2>
      <div className={styles.presetRow} role="group" aria-label="Size of the fall">
        {FALLS.map((f) => (
          <button key={f} type="button" aria-pressed={fall === f} className={`${styles.subLink} ${fall === f ? styles.subLinkActive : ''}`} onClick={() => setFall(f)}>
            -{f}%
          </button>
        ))}
        <label className={styles.fieldLabel} htmlFor="stress-scope">in</label>
        <select id="stress-scope" className={styles.input} style={{ width: 'auto' }} value={sector} onChange={(e) => setSector(e.target.value)}>
          <option value={WHOLE_MARKET}>everything</option>
          {sectors.map((s) => <option key={s} value={s}>{s} only</option>)}
        </select>
      </div>
      <p className={styles.stressFigure}>-{inr(result.lossINR)} <span>({result.lossPct.toFixed(1)}% of {inr(result.totalValue)})</span></p>
      <p className={result.withinTolerance ? styles.ok : styles.error}>
        {result.withinTolerance ? 'Within' : 'Beyond'} your {result.tolerancePct}% drawdown tolerance.
      </p>
      <p className={styles.note}>Today&apos;s values with every affected price cut by the same percentage. An illustration, not a forecast.</p>
    </section>
  );
}

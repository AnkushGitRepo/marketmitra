'use client';

import { useState } from 'react';
import { formatInr } from '@/lib/dashboard/format';
import { useMask } from '@/lib/dashboard/MaskContext';
import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import { OTHER_SECTOR, simulateWhatIf, type Snapshot, type WhatIfLeg } from '@/lib/portfolio/rebalance';
import styles from './RebalanceSandbox.module.css';

interface RebalanceSandboxProps {
  readonly holdings: readonly HoldingLike[];
  /** Total of the user's cash entries. */
  readonly cash: number;
}

interface LegDraft {
  readonly id: number;
  readonly kind: 'add' | 'trim';
  readonly symbol: string;
  readonly value: string;
  readonly sector: string;
  readonly fromCash: boolean;
}

const MAX_LEGS = 6;
const pct = (n: number) => `${n.toFixed(1)}%`;

function toLeg(d: LegDraft): WhatIfLeg | null {
  const symbol = d.symbol.trim();
  const n = Number(d.value.replace(/,/g, ''));
  if (!symbol || !(n > 0)) return null;
  return d.kind === 'add'
    ? { kind: 'add', symbol, amount: n, sector: d.sector || null, fromCash: d.fromCash }
    : { kind: 'trim', symbol, shares: n };
}

export function RebalanceSandbox({ holdings, cash }: RebalanceSandboxProps) {
  const { masked } = useMask();
  const [drafts, setDrafts] = useState<readonly LegDraft[]>([]);
  const nextId = drafts.reduce((m, d) => Math.max(m, d.id + 1), 1);

  const sectors = [...new Set([...holdings.map((h) => h.sector).filter((s): s is string => !!s), OTHER_SECTOR])];
  const legs = drafts.map(toLeg).filter((l): l is WhatIfLeg => l !== null);
  const result = legs.length > 0 ? simulateWhatIf(holdings, cash, legs) : null;

  const update = (id: number, patch: Partial<LegDraft>) => setDrafts((all) => all.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const addLeg = (kind: 'add' | 'trim') =>
    setDrafts((all) => [...all, { id: nextId, kind, symbol: holdings[0]?.symbol ?? '', value: '', sector: '', fromCash: false }]);

  return (
    <section className={styles.panel} aria-labelledby="whatif-title">
      <div className={styles.header}>
        <h2 id="whatif-title" className={styles.title}>What-if rebalance</h2>
        <p className={styles.hint}>Try a change and see the mix before and after. Nothing is saved or traded, and it is arithmetic on your own numbers, not a recommendation.</p>
      </div>

      {holdings.length === 0 ? <p className={styles.empty}>Add a position to try a what-if.</p> : (
        <>
          <ul className={styles.legs}>
            {drafts.map((d) => {
              const held = holdings.some((h) => h.symbol.toUpperCase() === d.symbol.trim().toUpperCase());
              return (
                <li key={d.id} className={styles.leg}>
                  <span className={styles.kind}>{d.kind === 'add' ? 'Put in ₹' : 'Trim shares'}</span>
                  <input className={styles.input} list="whatif-symbols" value={d.symbol} onChange={(e) => update(d.id, { symbol: e.target.value })} aria-label="Symbol" placeholder="Symbol" />
                  <input className={styles.input} inputMode="decimal" value={d.value} onChange={(e) => update(d.id, { value: e.target.value })} aria-label={d.kind === 'add' ? 'Amount in rupees' : 'Number of shares'} placeholder={d.kind === 'add' ? 'Amount (₹)' : 'Shares'} />
                  {d.kind === 'add' && !held && d.symbol.trim() ? (
                    <select className={styles.input} value={d.sector} onChange={(e) => update(d.id, { sector: e.target.value })} aria-label="Sector of the new position">
                      <option value="">Sector…</option>
                      {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  ) : null}
                  {d.kind === 'add' && cash > 0 ? (
                    <label className={styles.check}><input type="checkbox" checked={d.fromCash} onChange={(e) => update(d.id, { fromCash: e.target.checked })} />From my cash</label>
                  ) : null}
                  <button type="button" className={styles.remove} onClick={() => setDrafts((all) => all.filter((x) => x.id !== d.id))}>Remove</button>
                </li>
              );
            })}
          </ul>
          <datalist id="whatif-symbols">{holdings.map((h) => <option key={h.symbol} value={h.symbol} />)}</datalist>
          <div className={styles.buttons}>
            <button type="button" className={styles.secondary} disabled={drafts.length >= MAX_LEGS} onClick={() => addLeg('add')}>+ Put money in</button>
            <button type="button" className={styles.secondary} disabled={drafts.length >= MAX_LEGS} onClick={() => addLeg('trim')}>+ Trim a holding</button>
            {drafts.length > 0 ? <button type="button" className={styles.link} onClick={() => setDrafts([])}>Clear</button> : null}
          </div>
        </>
      )}

      {result ? (
        <div className={styles.result} aria-live="polite">
          <Comparison before={result.before} after={result.after} masked={masked} />
          {result.warnings.length > 0 ? <ul className={styles.warnings}>{result.warnings.map((w) => <li key={w}>{w}</li>)}</ul> : null}
        </div>
      ) : drafts.length > 0 ? <p className={styles.empty}>Fill in a symbol and an amount to see the effect.</p> : null}
    </section>
  );
}

function Comparison({ before, after, masked }: { readonly before: Snapshot; readonly after: Snapshot; readonly masked: boolean }) {
  const rows: Array<{ label: string; before: string; after: string }> = [
    { label: 'Top sector', before: before.topSector ? `${before.topSector.name} ${pct(before.topSector.pct)}` : '—', after: after.topSector ? `${after.topSector.name} ${pct(after.topSector.pct)}` : '—' },
    { label: 'Top 3 holdings', before: pct(before.top3Pct), after: pct(after.top3Pct) },
    { label: 'Largest position', before: before.largest ? `${before.largest.symbol} ${pct(before.largest.pct)}` : '—', after: after.largest ? `${after.largest.symbol} ${pct(after.largest.pct)}` : '—' },
    { label: 'Cash share', before: pct(before.cashPct), after: pct(after.cashPct) },
    { label: 'Equity value', before: formatInr(before.equity, 0, masked), after: formatInr(after.equity, 0, masked) },
  ];
  const names = [...new Set([...before.sectors, ...after.sectors].map((s) => s.name))];
  const share = (snap: Snapshot, name: string) => snap.sectors.find((s) => s.name === name)?.pct ?? 0;
  return (
    <>
      <table className={styles.table}>
        <thead><tr><th scope="col">Mix</th><th scope="col">Now</th><th scope="col">After</th></tr></thead>
        <tbody>
          {rows.map((r) => <tr key={r.label}><th scope="row">{r.label}</th><td>{r.before}</td><td>{r.after}</td></tr>)}
        </tbody>
      </table>
      <table className={styles.table}>
        <thead><tr><th scope="col">Sector (share of stocks)</th><th scope="col">Now</th><th scope="col">After</th></tr></thead>
        <tbody>
          {names.map((n) => <tr key={n}><th scope="row">{n}</th><td>{pct(share(before, n))}</td><td>{pct(share(after, n))}</td></tr>)}
        </tbody>
      </table>
    </>
  );
}

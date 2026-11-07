'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { importPolicy } from '@/lib/advisor/policy/io';
import { REBALANCE_CADENCES, type InvestmentPolicy } from '@/lib/advisor/policy/schema';
import styles from './advisor.module.css';

interface Props {
  initial: InvestmentPolicy;
  hasSaved: boolean;
}

const num = (v: string) => (v === '' ? 0 : Number(v));
const csv = (v: string) =>
  v
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

export function PolicyForm({ initial, hasSaved }: Props) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [p, setP] = useState<InvestmentPolicy>(initial);
  const [sectors, setSectors] = useState(initial.excludedSectors.join(', '));
  const [tickers, setTickers] = useState(initial.excludedTickers.join(', '));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);

  const set = <K extends keyof InvestmentPolicy>(key: K, value: InvestmentPolicy[K]) => {
    setSaved(false);
    setP((prev) => ({ ...prev, [key]: value }));
  };
  const alloc = p.targetAllocation;
  const setAlloc = (k: keyof InvestmentPolicy['targetAllocation'], v: number) =>
    set('targetAllocation', { ...alloc, [k]: v });

  const save = async () => {
    setBusy(true);
    setErrors([]);
    const body = { ...p, excludedSectors: csv(sectors), excludedTickers: csv(tickers).map((t) => t.toUpperCase()) };
    try {
      const res = await fetch('/api/advisor/policy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => null)) as {
        issues?: { path: string; message: string }[];
        error?: string;
      } | null;
      if (!res.ok) {
        setErrors(data?.issues?.map((i) => i.message) ?? [data?.error ?? 'Could not save the policy.']);
        return;
      }
      setSaved(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const onImport = async (file: File | undefined) => {
    if (!file) return;
    const result = importPolicy(await file.text());
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setErrors([]);
    setSaved(false);
    setP(result.policy);
    setSectors(result.policy.excludedSectors.join(', '));
    setTickers(result.policy.excludedTickers.join(', '));
  };

  const field = (id: string, label: string, value: number, onChange: (n: number) => void, step = 1) => (
    <div className={styles.field}>
      <label className={styles.fieldLabel} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className={styles.input}
        type="number"
        step={step}
        value={value}
        onChange={(e) => onChange(num(e.target.value))}
      />
    </div>
  );

  return (
    <>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>Policy</p>
          <h1 className={styles.h1}>Investment Policy</h1>
        </div>
        <div className={styles.formActions}>
          {hasSaved && (
            <a className={styles.btnGhost} href="/api/advisor/policy?format=file">
              Export JSON
            </a>
          )}
          <button type="button" className={styles.btnGhost} onClick={() => fileRef.current?.click()}>
            Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              void onImport(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      </div>
      <p className={styles.muted}>
        The rulebook you write once. The plan is derived from it and nothing in the app can override it.
        Importing a file only fills the form — nothing is saved until you press Save.
      </p>

      <div className={styles.card}>
        <h2 className={styles.h2}>Money and horizon</h2>
        <div className={styles.grid}>
          {field('monthly', 'Monthly contribution (₹)', p.monthlyContributionINR, (n) => set('monthlyContributionINR', n), 500)}
          {field('lump', 'Lump sum, if any (₹)', p.lumpSumINR ?? 0, (n) => set('lumpSumINR', n > 0 ? n : undefined), 1000)}
          {field('horizon', 'Horizon (years)', p.horizonYears, (n) => set('horizonYears', n))}
          {field('dd', 'Max tolerable drawdown (%)', p.maxTolerableDrawdownPct, (n) => set('maxTolerableDrawdownPct', n))}
        </div>

        <h2 className={styles.h2}>Target allocation (must total 100)</h2>
        <div className={styles.grid}>
          {field('core', 'Index core (%)', alloc.indexCorePct, (n) => setAlloc('indexCorePct', n))}
          {field('sat', 'Satellite stocks (%)', alloc.satellitePct, (n) => setAlloc('satellitePct', n))}
          {field('cash', 'Cash (%)', alloc.cashPct, (n) => setAlloc('cashPct', n))}
        </div>

        <h2 className={styles.h2}>Index core holdings (weights must total 100)</h2>
        {p.indexCoreHoldings.map((h, i) => (
          <div key={i} className={styles.formRow}>
            <input
              className={styles.input}
              aria-label={`Index fund ${i + 1} name`}
              value={h.name}
              placeholder="e.g. Nifty 50 index fund"
              onChange={(e) =>
                set('indexCoreHoldings', p.indexCoreHoldings.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
              }
            />
            <input
              className={`${styles.input} ${styles.narrow}`}
              aria-label={`Index fund ${i + 1} weight`}
              type="number"
              value={h.weightPct}
              onChange={(e) =>
                set('indexCoreHoldings', p.indexCoreHoldings.map((x, j) => (j === i ? { ...x, weightPct: num(e.target.value) } : x)))
              }
            />
            <button
              type="button"
              className={styles.btnGhost}
              onClick={() => set('indexCoreHoldings', p.indexCoreHoldings.filter((_, j) => j !== i))}
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className={styles.btnGhost}
          onClick={() => set('indexCoreHoldings', [...p.indexCoreHoldings, { name: '', weightPct: 0 }])}
        >
          Add index fund
        </button>

        <h2 className={styles.h2}>Satellite and discipline rules</h2>
        <div className={styles.grid}>
          {field('maxpos', 'Max per stock (%)', p.maxPositionPct, (n) => set('maxPositionPct', n))}
          {field('maxsat', 'Max satellite stocks', p.maxSatelliteStocks, (n) => set('maxSatelliteStocks', n))}
          {field('hold', 'Minimum hold (months)', p.minHoldMonths, (n) => set('minHoldMonths', n))}
          {field('tranche', 'Lump-sum tranches (months)', p.trancheMonths, (n) => set('trancheMonths', n))}
          {field('dip', 'Buy-the-dip cooldown (days)', p.dipCooldownDays, (n) => set('dipCooldownDays', n))}
          {field('band', 'Rebalance band (± %)', p.rebalanceBandPct, (n) => set('rebalanceBandPct', n), 0.5)}
          <div className={styles.field}>
            <label className={styles.fieldLabel} htmlFor="cadence">
              Rebalance cadence
            </label>
            <select
              id="cadence"
              className={styles.input}
              value={p.rebalanceCadence}
              onChange={(e) => set('rebalanceCadence', e.target.value as InvestmentPolicy['rebalanceCadence'])}
            >
              {REBALANCE_CADENCES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>
        <label className={styles.check}>
          <input type="checkbox" checked={p.taxAware} onChange={(e) => set('taxAware', e.target.checked)} />
          Tax-aware: rebalance with new money rather than selling where possible
        </label>

        <h2 className={styles.h2}>Exclusions</h2>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="xs">
            Excluded sectors (comma-separated)
          </label>
          <input id="xs" className={styles.input} value={sectors} onChange={(e) => { setSaved(false); setSectors(e.target.value); }} />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="xt">
            Excluded tickers (comma-separated)
          </label>
          <input id="xt" className={styles.input} value={tickers} onChange={(e) => { setSaved(false); setTickers(e.target.value); }} />
        </div>

        {errors.length > 0 && (
          <ul className={styles.errorList} role="alert">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className={styles.formActions}>
          <button type="button" className={styles.btnPrimary} disabled={busy} onClick={save}>
            {busy ? 'Saving…' : 'Save policy'}
          </button>
          {saved && <span className={styles.ok}>Saved.</span>}
        </div>
      </div>
    </>
  );
}

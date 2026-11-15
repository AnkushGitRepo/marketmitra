'use client';

import { useState } from 'react';
import type { FitCheck } from '@/lib/advisor/diagnostics/fit';
import styles from './advisor.module.css';

interface FitData {
  symbol: string;
  name: string | null;
  checks: FitCheck[];
  breaches: number;
}

interface Props {
  profile: string;
}

export function FitChecker({ profile }: Props) {
  const [symbol, setSymbol] = useState('');
  const [amount, setAmount] = useState('10000');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<FitData | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const qs = new URLSearchParams({ symbol: symbol.trim(), amount, profile });
      const res = await fetch(`/api/advisor/fit?${qs}`);
      const body = (await res.json().catch(() => null)) as { success?: boolean; data?: FitData; error?: string } | null;
      if (!res.ok || !body?.success || !body.data) {
        setError(body?.error ?? 'Could not run the check.');
        return;
      }
      setResult(body.data);
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="fit-h">
      <p className={styles.eyebrow}>Before adding a stock</p>
      <h2 id="fit-h" className={styles.h2}>Does it fit my rules?</h2>
      <form className={styles.formRow} onSubmit={(e) => { e.preventDefault(); void run(); }}>
        <input className={styles.input} placeholder="Ticker, e.g. TCS" aria-label="Ticker symbol" value={symbol} onChange={(e) => setSymbol(e.target.value)} />
        <input className={`${styles.input} ${styles.narrow}`} type="number" min={1} step="any" aria-label="Amount in rupees" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button type="submit" className={styles.btnPrimary} disabled={busy || symbol.trim() === ''}>{busy ? 'Checking…' : 'Check'}</button>
      </form>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {result && (
        <>
          <p className={result.breaches === 0 ? styles.verdictOk : styles.verdictWarn} role="status">
            {result.breaches === 0 ? `Passes all ${result.checks.length} rules` : `Over ${result.breaches === 1 ? 'one rule' : `${result.breaches} rules`}`}
          </p>
          <ul className={styles.pills} aria-label="Rule results">
            {result.checks.map((c) => (
              <li key={c.id} className={`${styles.pill} ${c.status === 'fail' ? styles.pillOver : c.status === 'unknown' ? styles.pillWatch : ''}`}>{c.chip}</li>
            ))}
          </ul>
          {result.checks.some((c) => c.status !== 'pass') && (
            <ul className={styles.claims}>
              {result.checks.filter((c) => c.status !== 'pass').map((c) => (
                <li key={c.id} className={styles.claim}><strong>{c.label}.</strong> {c.detail}</li>
              ))}
            </ul>
          )}
          <p className={styles.note}>This checks your own rules, not the company.</p>
        </>
      )}
    </section>
  );
}

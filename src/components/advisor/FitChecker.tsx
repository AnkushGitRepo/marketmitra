'use client';

import { useState } from 'react';
import type { CheckStatus, FitCheck } from '@/lib/advisor/diagnostics/fit';
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

const MARK: Record<CheckStatus, string> = { pass: 'Within', fail: 'Over', unknown: 'Unknown' };

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
        <input className={`${styles.input} ${styles.narrow}`} type="number" min={1} step={1000} aria-label="Amount in rupees" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <button type="submit" className={styles.btnPrimary} disabled={busy || symbol.trim() === ''}>{busy ? 'Checking…' : 'Check'}</button>
      </form>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {result && (
        <>
          <ul className={styles.claims}>
            {result.checks.map((c) => (
              <li key={c.id} className={styles.claim}><span className={styles.tag}>{MARK[c.status]}</span> <strong>{c.label}.</strong> {c.detail}</li>
            ))}
          </ul>
          <p className={styles.note}>
            {result.breaches === 0 ? `${result.symbol} stays inside your limits at this amount.` : `${result.symbol} would break ${result.breaches} of your rules at this amount.`} This checks your own rules, not the company.
          </p>
        </>
      )}
    </section>
  );
}

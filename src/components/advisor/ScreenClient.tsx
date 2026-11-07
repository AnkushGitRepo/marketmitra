'use client';

import { useState } from 'react';
import type { GateResult, ScreenResult } from '@/lib/advisor/screen/types';
import styles from './advisor.module.css';

interface Outcome {
  name: string;
  sector: string | null;
  result: ScreenResult;
}

const STATUS_LABEL: Record<GateResult['status'], string> = {
  pass: 'Pass',
  fail: 'Fail',
  unknown: 'Unknown',
  not_applicable: 'Skipped',
};

export function ScreenClient() {
  const [symbol, setSymbol] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  const run = async () => {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    setBusy(true);
    setError(null);
    setOutcome(null);
    try {
      const res = await fetch(`/api/advisor/screen?symbol=${encodeURIComponent(s)}`);
      const body = (await res.json().catch(() => null)) as { data?: Outcome; error?: string } | null;
      if (!res.ok || !body?.data) {
        setError(body?.error ?? 'The screen could not be run.');
        return;
      }
      setOutcome(body.data);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>Quality screen</p>
          <h1 className={styles.h1}>Screen a company</h1>
        </div>
      </div>
      <p className={styles.muted}>
        Fixed rules over the company’s own reported numbers. A stock must pass every hard gate to be
        eligible; a gate that cannot be checked shows as Unknown and counts against eligibility rather
        than being skipped.
      </p>
      <div className={styles.formRow}>
        <input
          className={`${styles.input} ${styles.narrow}`}
          aria-label="NSE symbol"
          placeholder="e.g. TCS"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void run()}
        />
        <button type="button" className={styles.btnPrimary} disabled={busy || !symbol.trim()} onClick={run}>
          {busy ? 'Screening…' : 'Run screen'}
        </button>
      </div>
      {error && <p className={styles.error}>{error}</p>}
      {outcome && (
        <div className={styles.card}>
          <p className={styles.eyebrow}>{outcome.result.symbol} · {outcome.sector ?? 'sector unknown'}</p>
          <h2 className={styles.h2}>
            {outcome.name}: {outcome.result.eligible ? 'passes every hard gate' : 'not eligible'} · {outcome.result.score}% of gates passed
          </h2>
          <ul className={styles.lines}>
            {outcome.result.gates.map((g) => (
              <li key={g.id} className={styles.line}>
                <span className={styles.tag}>{STATUS_LABEL[g.status]}</span>
                <span className={styles.lineTarget}>{g.label}</span>
                <span className={styles.lineAmount}>{g.actual}</span>
                <span className={styles.lineRule}>
                  Rule: {g.threshold}. {g.detail}
                </span>
              </li>
            ))}
          </ul>
          {outcome.result.flags.map((f) => (
            <p key={f} className={styles.note}>⚠ {f}</p>
          ))}
        </div>
      )}
    </>
  );
}

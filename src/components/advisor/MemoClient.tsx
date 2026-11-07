'use client';

import { useState } from 'react';
import type { StoredMemo } from '@/lib/advisor/memo/store';
import type { Claim } from '@/lib/advisor/memo/types';
import styles from './advisor.module.css';

function ClaimView({ claim }: { claim: Claim }) {
  return (
    <li className={styles.claim}>
      <span className={claim.notFound ? styles.notFound : undefined}>{claim.text}</span>
      {claim.citations.length > 0 && (
        <details className={styles.cites}>
          <summary>Sources ({claim.citations.length})</summary>
          {claim.citations.map((c, i) => (
            <blockquote key={i} className={styles.quote}>
              “{c.quote}” <span className={styles.srcId}>[{c.sourceId}]</span>
            </blockquote>
          ))}
        </details>
      )}
    </li>
  );
}

function Section({ title, claims }: { title: string; claims: Claim[] }) {
  return (
    <>
      <h3 className={styles.h2}>{title}</h3>
      <ul className={styles.claims}>
        {claims.map((c, i) => (
          <ClaimView key={i} claim={c} />
        ))}
      </ul>
    </>
  );
}

export function MemoClient() {
  const [symbol, setSymbol] = useState('');
  const [allowIneligible, setAllowIneligible] = useState(false);
  const [filingUrl, setFilingUrl] = useState('');
  const [filingText, setFilingText] = useState('');
  const [recordAmount, setRecordAmount] = useState('');
  const [recorded, setRecorded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [memo, setMemo] = useState<StoredMemo | null>(null);

  const call = async (method: 'GET' | 'POST') => {
    const s = symbol.trim().toUpperCase();
    if (!s) return;
    setBusy(true);
    setError(null);
    setIssues([]);
    try {
      const res =
        method === 'POST'
          ? await fetch('/api/advisor/memo', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                symbol: s,
                allowIneligible,
                ...(filingUrl.trim() ? { filingUrl: filingUrl.trim() } : {}),
                ...(filingText.trim() ? { filingText: filingText.trim() } : {}),
              }),
            })
          : await fetch(`/api/advisor/memo?symbol=${encodeURIComponent(s)}`);
      const body = (await res.json().catch(() => null)) as {
        data?: StoredMemo | null;
        error?: string;
        issues?: { path: string; message: string }[];
      } | null;
      if (!res.ok) {
        setMemo(null);
        setError(body?.error ?? 'Request failed.');
        setIssues(body?.issues?.map((i) => `${i.path}: ${i.message}`) ?? []);
        return;
      }
      if (!body?.data) setError(`No saved memo for ${s} yet.`);
      setMemo(body?.data ?? null);
    } finally {
      setBusy(false);
    }
  };

  const record = async () => {
    if (!memo) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/advisor/journal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'stock', memoId: memo.id, amountINR: Number(recordAmount) }),
      });
      setRecorded(res.ok ? `Recorded in your journal. Kill criteria are now monitored.` : null);
      if (!res.ok) setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Could not record.');
    } finally {
      setBusy(false);
    }
  };

  const m = memo?.memo;
  return (
    <>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>Research memo</p>
          <h1 className={styles.h1}>Cited research memo</h1>
        </div>
      </div>
      <p className={styles.muted}>
        Written from the company’s latest annual report and the screen’s measured values. Every claim
        carries a verbatim quote you can open; where the material doesn’t say, the memo says so. A memo
        whose quotes can’t be verified is rejected, not shown. It describes a business — it does not
        recommend a trade.
      </p>
      <div className={styles.formRow}>
        <input
          className={`${styles.input} ${styles.narrow}`}
          aria-label="NSE symbol"
          placeholder="e.g. TCS"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        />
        <button type="button" className={styles.btnPrimary} disabled={busy || !symbol.trim()} onClick={() => call('POST')}>
          {busy ? 'Working…' : 'Write memo'}
        </button>
        <button type="button" className={styles.btnGhost} disabled={busy || !symbol.trim()} onClick={() => call('GET')}>
          Load saved
        </button>
      </div>
      <label className={styles.check}>
        <input type="checkbox" checked={allowIneligible} onChange={(e) => setAllowIneligible(e.target.checked)} />
        Write it even if the stock doesn’t clear the quality screen (research only)
      </label>
      <details className={styles.cites}>
        <summary>Use a filing of your own (if the default download is refused)</summary>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="filing-url">Filing PDF URL (https)</label>
          <input id="filing-url" className={styles.input} value={filingUrl} onChange={(e) => setFilingUrl(e.target.value)} placeholder="https://… (company investor-relations site)" />
        </div>
        <div className={styles.field}>
          <label className={styles.fieldLabel} htmlFor="filing-text">…or paste the filing text</label>
          <textarea id="filing-text" className={styles.input} rows={5} value={filingText} onChange={(e) => setFilingText(e.target.value)} />
        </div>
      </details>
      {error && <p className={styles.error}>{error}</p>}
      {issues.length > 0 && (
        <ul className={styles.errorList}>
          {issues.map((i) => (
            <li key={i}>{i}</li>
          ))}
        </ul>
      )}

      {memo && m && (
        <div className={styles.card}>
          <p className={styles.eyebrow}>
            {memo.symbol} · {new Date(memo.createdAt).toLocaleDateString('en-IN')} · {memo.promptVersion} · {memo.model}
          </p>
          <h2 className={styles.h2}>{memo.name}</h2>
          {memo.screenOverridden && (
            <p className={styles.note}>⚠ This stock did not clear the quality screen — research only.</p>
          )}
          <Section title="Business" claims={m.business} />
          <Section title="Moat" claims={[m.moat.assessment]} />
          <Section title="What could erode it" claims={m.moat.erosionRisks} />
          <Section title="Management" claims={m.management} />
          <Section title="Capital allocation" claims={m.capitalAllocation} />
          <Section title="Risks" claims={m.risks} />
          <Section title="Thesis" claims={[m.thesis]} />
          <h3 className={styles.h2}>Kill criteria — if these hold, the thesis is broken</h3>
          <ul className={styles.claims}>
            {m.killCriteria.map((k, i) => (
              <li key={i} className={styles.claim}>
                <strong>{k.description}</strong> ({k.metric} {k.operator} {k.threshold} for {k.consecutivePeriods} {k.periodUnit}
                {k.consecutivePeriods > 1 ? 's' : ''})
                <ClaimView claim={k.rationale} />
              </li>
            ))}
            {memo.baselineKillCriteria.map((k, i) => (
              <li key={`b${i}`} className={styles.claim}>
                <strong>{k.description}</strong> <span className={styles.srcId}>[standing rule]</span>
              </li>
            ))}
          </ul>
          <h3 className={styles.h2}>Record it</h3>
          <p className={styles.muted}>
            Recording keeps this memo, today’s price and its kill criteria in your journal. It does not buy anything.
          </p>
          <div className={styles.formRow}>
            <input className={`${styles.input} ${styles.narrow}`} type="number" aria-label="Amount in rupees" placeholder="₹ amount" value={recordAmount} onChange={(e) => { setRecorded(null); setRecordAmount(e.target.value); }} />
            <button type="button" className={styles.btnGhost} disabled={busy || !(Number(recordAmount) > 0)} onClick={record}>Record in journal</button>
            {recorded && <span className={styles.ok}>{recorded}</span>}
          </div>
        </div>
      )}
    </>
  );
}

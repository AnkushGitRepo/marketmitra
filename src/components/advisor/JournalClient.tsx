'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { JournalEntry } from '@/lib/advisor/journal/types';
import styles from './advisor.module.css';

const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

interface Review {
  entriesChecked: number;
  criteriaChecked: number;
  fired: Array<{ symbol: string; description: string }>;
  unknown: number;
  errors: string[];
}

export function JournalClient({ entries, prices }: { entries: JournalEntry[]; prices: Record<string, number> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<Review | null>(null);
  const [modifying, setModifying] = useState<string | null>(null);
  const [amount, setAmount] = useState('');

  const send = async (url: string, init: RequestInit) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
      const body = (await res.json().catch(() => null)) as { data?: unknown; error?: string } | null;
      if (!res.ok) {
        setError(body?.error ?? 'Request failed.');
        return null;
      }
      return body?.data ?? null;
    } finally {
      setBusy(false);
    }
  };

  const act = async (id: string, action: 'followed' | 'ignored' | 'modified', actedAmountINR?: number) => {
    const ok = await send(`/api/advisor/journal/${id}`, { method: 'PATCH', body: JSON.stringify({ action, actedAmountINR }) });
    if (ok) {
      setModifying(null);
      setAmount('');
      router.refresh();
    }
  };

  return (
    <>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>Journal</p>
          <h1 className={styles.h1}>Decision journal</h1>
        </div>
        <div className={styles.formActions}>
          <button type="button" className={styles.btnGhost} disabled={busy} onClick={async () => { if (await send('/api/advisor/journal', { method: 'POST', body: JSON.stringify({ kind: 'plan' }) })) router.refresh(); }}>
            Record this month’s plan
          </button>
          <button type="button" className={styles.btnPrimary} disabled={busy} onClick={async () => setReview((await send('/api/advisor/review', { method: 'POST' })) as Review | null)}>
            Check theses now
          </button>
        </div>
      </div>
      <p className={styles.muted}>
        Every recommendation you record is kept with its price, thesis and the data it was based on, so you can
        compare what was suggested with what you did and what happened. You are only notified when one of its
        kill criteria actually fires — silence means nothing has broken.
      </p>
      {error && <p className={styles.error}>{error}</p>}
      {review && (
        <p className={styles.note}>
          Checked {review.entriesChecked} recommendation(s), {review.criteriaChecked} criteria.{' '}
          {review.fired.length === 0 ? 'No kill criterion has fired.' : `Fired: ${review.fired.map((f) => `${f.symbol} — ${f.description}`).join('; ')}.`}
          {review.unknown > 0 && ` ${review.unknown} could not be evaluated (data unavailable).`}
          {review.errors.length > 0 && ` Problems: ${review.errors.join('; ')}`}
        </p>
      )}

      {entries.length === 0 ? (
        <div className={styles.card}><p className={styles.muted}>Nothing recorded yet. Write a research memo and record it, or record this month’s plan.</p></div>
      ) : (
        <div className={styles.card}>
          <ul className={styles.lines}>
            {entries.map((e) => {
              const now = prices[e.symbol.toUpperCase()];
              const move = e.priceAtTime && now ? ((now - e.priceAtTime) / e.priceAtTime) * 100 : null;
              return (
                <li key={e.id} className={styles.entry}>
                  <div className={styles.entryHead}>
                    <span className={styles.tag}>{e.kind === 'plan' ? 'Plan' : e.symbol}</span>
                    <strong>{e.name}</strong>
                    <span className={styles.lineAmount}>{inr(e.amountINR)}</span>
                  </div>
                  <p className={styles.lineRule}>
                    {new Date(e.createdAt).toLocaleDateString('en-IN')}
                    {e.priceAtTime !== null && <> · recorded at {inr(e.priceAtTime)}</>}
                    {move !== null && <> · now {inr(now)} ({move >= 0 ? '+' : ''}{move.toFixed(1)}% since)</>}
                  </p>
                  <p className={styles.claim}>{e.thesis}</p>
                  <p className={styles.lineRule}>
                    You: <strong>{e.action}</strong>
                    {e.action === 'modified' && e.actedAmountINR !== null && <> ({inr(e.actedAmountINR)} invested)</>}
                    {e.killCriteria.length > 0 && <> · {e.killCriteria.length} kill criteria{e.killFired.length > 0 && <strong> · {e.killFired.length} FIRED</strong>}</>}
                  </p>
                  {e.killFired.map((f) => (
                    <p key={f.key} className={styles.error}>⚠ {f.description} — fired {new Date(f.at).toLocaleDateString('en-IN')}</p>
                  ))}
                  {e.action === 'pending' && (
                    <div className={styles.formRow}>
                      <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => act(e.id, 'followed')}>I followed this</button>
                      <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => act(e.id, 'ignored')}>I ignored this</button>
                      {modifying === e.id ? (
                        <>
                          <input className={`${styles.input} ${styles.narrow}`} type="number" aria-label="Amount invested" placeholder="₹ invested" value={amount} onChange={(ev) => setAmount(ev.target.value)} />
                          <button type="button" className={styles.btnPrimary} disabled={busy || amount === ''} onClick={() => act(e.id, 'modified', Number(amount))}>Save</button>
                        </>
                      ) : (
                        <button type="button" className={styles.btnGhost} disabled={busy} onClick={() => setModifying(e.id)}>I changed it</button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}

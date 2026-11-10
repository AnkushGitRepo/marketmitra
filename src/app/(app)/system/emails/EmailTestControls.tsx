'use client';

import { useState } from 'react';
import styles from './page.module.css';

interface Result {
  readonly id: string;
  readonly label: string;
  readonly ok: boolean;
  readonly error?: string;
}

interface Props {
  readonly selectedId: string;
  readonly selectedLabel: string;
}

/** Sends real test emails to the admin's OWN address and shows exactly what the provider said. */
export function EmailTestControls({ selectedId, selectedLabel }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<{ to?: string; results: readonly Result[]; error?: string } | null>(null);

  const send = async (id: string) => {
    setBusy(id);
    setOutcome(null);
    try {
      const res = await fetch('/api/system/emails/test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const body = (await res.json().catch(() => null)) as { data?: { to?: string; results?: Result[] } | null; error?: string | null } | null;
      setOutcome({ to: body?.data?.to, results: body?.data?.results ?? [], error: body?.data?.results ? undefined : (body?.error ?? 'Request failed') });
    } catch {
      setOutcome({ results: [], error: 'Network error. Try again.' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.testBox}>
      <div className={styles.testRow}>
        <button type="button" className={styles.testBtn} disabled={busy !== null} onClick={() => void send(selectedId)}>
          {busy === selectedId ? 'Sending…' : `Send “${selectedLabel}” to me`}
        </button>
        <button type="button" className={styles.testBtnGhost} disabled={busy !== null} onClick={() => void send('all')}>
          {busy === 'all' ? 'Sending all…' : 'Send all to me'}
        </button>
        <span className={styles.testHint}>Goes only to your own address, subject marked [TEST].</span>
      </div>
      {outcome?.error && <p className={styles.testError} role="alert">{outcome.error}</p>}
      {outcome && outcome.results.length > 0 && (
        <ul className={styles.testResults} aria-label="Test results">
          {outcome.results.map((r) => (
            <li key={r.id} className={r.ok ? styles.resultOk : styles.resultFail}>
              <strong>{r.ok ? '✓' : '✗'} {r.label}</strong>
              {!r.ok && r.error && <span> — {r.error}</span>}
            </li>
          ))}
          {outcome.to && <li className={styles.testHint}>Sent to {outcome.to}</li>}
        </ul>
      )}
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DISCLAIMER_POINTS } from '@/lib/advisor/disclaimer';
import styles from './advisor.module.css';

export function AcknowledgeGate() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/advisor/acknowledge', { method: 'POST' });
      if (!res.ok) {
        setError('Could not record your acceptance. Try again.');
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.card}>
      <p className={styles.eyebrow}>Before you start</p>
      <h1 className={styles.h1}>Mitra Advisor</h1>
      <ul className={styles.points}>
        {DISCLAIMER_POINTS.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <label className={styles.check}>
        <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        I have read this and understand it.
      </label>
      {error && <p className={styles.error}>{error}</p>}
      <button type="button" className={styles.btnPrimary} disabled={!checked || busy} onClick={accept}>
        Accept and continue
      </button>
    </div>
  );
}

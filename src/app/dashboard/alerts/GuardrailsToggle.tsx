'use client';

import { useState } from 'react';
import styles from './GuardrailsToggle.module.css';

interface Props {
  initialEnabled: boolean;
}

/** Toggle for the default trailing-stop + drawdown-watch pair auto-created
 * on every new holding (ADR 0030). Lives next to the notification-channel
 * settings since it's the same "what happens automatically" surface. */
export function GuardrailsToggle({ initialEnabled }: Props) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !enabled;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/settings/guardrails', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        setError('Could not save that.');
        return;
      }
      setEnabled(next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.card}>
      <div>
        <h3 className={styles.title}>Default guardrail alerts</h3>
        <p className={styles.hint}>
          When on, every new holding automatically gets a 10% trailing stop and a drawdown watch
          (15% over 4 sessions) — Mitra tells you when it sets one up, and you can edit or remove
          either alert anytime below.
        </p>
        {error && <p className={styles.error}>{error}</p>}
      </div>
      <label className={styles.switchLabel}>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={toggle}
          aria-label="Auto-create default guardrail alerts on new holdings"
        />
        <span className={styles.switchTrack} />
      </label>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import styles from './MemoryChip.module.css';

interface MemoryChipProps {
  readonly action: 'remembered' | 'forgot';
  readonly id: string;
  readonly text: string;
}

/** Shows what Mitra just saved to (or removed from) its memory, with a one-click undo for a save and a link to review everything. */
export function MemoryChip({ action, id, text }: MemoryChipProps) {
  const [state, setState] = useState<'saved' | 'undone' | 'failed'>('saved');
  const [busy, setBusy] = useState(false);

  const undo = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/mitra/memories/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setState(res.ok || res.status === 404 ? 'undone' : 'failed');
    } catch {
      setState('failed');
    } finally {
      setBusy(false);
    }
  };

  const label = action === 'remembered' ? 'Remembered' : 'Forgot';
  return (
    <div className={styles.chip} data-state={state} role="status">
      <span className={styles.label}>{state === 'undone' ? 'Removed from memory' : label}</span>
      <span className={styles.text}>{text}</span>
      {action === 'remembered' && state === 'saved' && (
        <button type="button" className={styles.undo} onClick={undo} disabled={busy}>
          Undo
        </button>
      )}
      {state === 'failed' && <span className={styles.error}>Could not undo. Try Settings.</span>}
      <Link href="/settings?tab=ai" className={styles.manage}>
        Manage memory
      </Link>
    </div>
  );
}

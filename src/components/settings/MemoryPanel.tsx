'use client';

import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { MAX_MEMORIES, MAX_MEMORY_CHARS, type Memory } from '@/lib/mitra-chat/memory/rules';
import styles from './MemoryPanel.module.css';

interface MemoryPanelProps {
  /** Mitra's memory is switched on. Off: nothing is saved or used, but what is stored stays here until deleted. */
  readonly enabled: boolean;
}

const when = (d: Date | string): string => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const KIND_LABEL: Record<string, string> = { profile: 'About you', goal: 'Goal', preference: 'Preference', holding: 'Holding', other: 'Other' };

/** Everything Mitra remembers about the user, with a delete for each, a way to add one, and "Forget everything". */
export function MemoryPanel({ enabled }: MemoryPanelProps) {
  const [items, setItems] = useState<Memory[] | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);

  // The list is read here and shown by the caller, so a read never sets state from inside the effect itself.
  const read = useCallback(async (): Promise<{ items: Memory[]; failed: boolean }> => {
    try {
      const res = await fetch('/api/mitra/memories');
      const data = (await res.json()) as { data?: Memory[] };
      return { items: res.ok ? (data.data ?? []) : [], failed: !res.ok };
    } catch {
      return { items: [], failed: true };
    }
  }, []);

  const load = useCallback(async () => {
    const r = await read();
    setItems(r.items);
    setError(r.failed ? 'Could not load your memory.' : null);
  }, [read]);

  useEffect(() => {
    let current = true;
    void read().then((r) => {
      if (!current) return;
      setItems(r.items);
      setError(r.failed ? 'Could not load your memory.' : null);
    });
    return () => {
      current = false;
    };
  }, [read]);

  const call = async (url: string, init: RequestInit): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      if (!res.ok) {
        setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'That did not work. Please try again.');
        return false;
      }
      await load();
      return true;
    } catch {
      setError('That did not work. Check your connection and try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const ok = await call('/api/mitra/memories', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
    if (ok) setText('');
  };

  return (
    <div className={styles.panel}>
      <p className={styles.hint}>
        {enabled
          ? 'Mitra saves durable things you tell it (your horizon, goals, risk comfort, how you like answers) and uses them in every chat. It only learns from your own messages, never from files, web pages or notes.'
          : 'Memory is off: Mitra is not saving or using anything. What is below stays until you delete it.'}
      </p>
      {items === null ? (
        <p className={styles.empty}>Loading…</p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>Nothing remembered yet. Tell Mitra something about how you invest, or add it below.</p>
      ) : (
        <ul className={styles.list}>
          {items.map((m) => (
            <li key={m.id} className={styles.item}>
              <div className={styles.body}>
                <span className={styles.text}>{m.text}</span>
                <span className={styles.meta}>
                  {KIND_LABEL[m.kind] ?? 'Other'} · {m.source === 'manual' ? 'written by you' : 'from a chat'} · {when(m.updatedAt)}
                </span>
              </div>
              <button type="button" className={styles.delete} disabled={busy} aria-label={`Delete memory: ${m.text}`} onClick={() => call(`/api/mitra/memories/${encodeURIComponent(m.id)}`, { method: 'DELETE' })}>
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className={styles.add}
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <input className={styles.input} value={text} maxLength={MAX_MEMORY_CHARS} placeholder="e.g. Saving for retirement in about 12 years" aria-label="Add a memory" onChange={(e) => setText(e.target.value)} />
        <button type="submit" className={styles.btn} disabled={busy || text.trim().length < 4}>
          Add
        </button>
        {items !== null && items.length > 0 && (
          <button type="button" className={styles.btn} disabled={busy} onClick={() => setConfirmAll(true)}>
            Forget everything
          </button>
        )}
      </form>
      <p className={styles.small}>
        {items?.length ?? 0} of {MAX_MEMORIES}. Never add identity, bank or login details.
      </p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <ConfirmDialog
        open={confirmAll}
        title="Forget everything?"
        message="Every memory Mitra has of you will be deleted. This cannot be undone."
        confirmLabel="Forget everything"
        busy={busy}
        onConfirm={async () => {
          await call('/api/mitra/memories', { method: 'DELETE' });
          setConfirmAll(false);
        }}
        onCancel={() => setConfirmAll(false)}
      />
    </div>
  );
}

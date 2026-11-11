'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { WatchlistNameDialog } from '@/components/watchlists/WatchlistNameDialog';
import styles from './WatchlistButton.module.css';

interface WatchlistRef {
  readonly id: string;
  readonly name: string;
  readonly symbols: readonly string[];
}

type Lists = { readonly status: 'idle' | 'loading' | 'error' } | { readonly status: 'ready'; readonly value: readonly WatchlistRef[] };
async function errorOf(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? fallback;
}

/** "+ Watchlist": add this stock to a list, or create a new list (in a modal). Renaming lives on the Markets page. */
export function WatchlistButton({ symbol }: { readonly symbol: string }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<Lists>({ status: 'idle' });
  const [message, setMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);
  const wrap = useRef<HTMLSpanElement>(null);

  // Close the menu on an outside click or Escape (the dialog handles its own Escape).
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (creating) return;
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open, creating]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    setMessage(null);
    if (!next || lists.status !== 'idle') return;
    setLists({ status: 'loading' });
    fetch('/api/watchlists')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('unavailable'))))
      .then((body: { data?: WatchlistRef[] }) => setLists({ status: 'ready', value: body.data ?? [] }))
      .catch(() => setLists({ status: 'error' }));
  };

  const current = lists.status === 'ready' ? lists.value : [];
  const update = (next: readonly WatchlistRef[]) => setLists({ status: 'ready', value: next });

  const addTo = async (list: WatchlistRef) => {
    try {
      const res = await fetch(`/api/watchlists/${list.id}/symbols`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      if (!res.ok) {
        setMessage(await errorOf(res, 'Could not add it. The list may be full.'));
        return;
      }
      update(current.map((l) => (l.id === list.id ? { ...l, symbols: [...l.symbols, symbol] } : l)));
      setMessage(`Added to ${list.name}.`);
      setOpen(false);
    } catch {
      setMessage('Could not reach the server. Try again.');
    }
  };

  const submitCreate = async (name: string) => {
    setBusy(true);
    setServerError(null);
    try {
      const res = await fetch('/api/watchlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const created = (await res.json().catch(() => null)) as { data?: WatchlistRef; error?: string } | null;
      if (!res.ok || !created?.data) {
        setServerError(created?.error ?? 'Could not create the watchlist.');
        return;
      }
      const added = await fetch(`/api/watchlists/${created.data.id}/symbols`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      update([...current, { ...created.data, symbols: added.ok ? [symbol] : [] }]);
      setMessage(added.ok ? `Created “${name}” and added ${symbol}.` : `Created “${name}”, but could not add ${symbol}.`);
      setCreating(false);
      setOpen(false);
    } catch {
      setServerError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className={styles.wrap} ref={wrap}>
      <button type="button" className={styles.btn} aria-expanded={open} aria-haspopup="menu" onClick={toggle}>
        + Watchlist <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu" aria-label="Watchlists">
          {lists.status === 'loading' && <p className={styles.muted}>Loading watchlists…</p>}
          {lists.status === 'error' && <p className={styles.muted}>Sign in to use watchlists.</p>}
          {lists.status === 'ready' && current.length === 0 && <p className={styles.muted}>No watchlists yet.</p>}
          {current.map((l) => {
            const has = l.symbols.includes(symbol);
            return (
              <div key={l.id}>
                <button type="button" role="menuitem" className={styles.item} disabled={has} onClick={() => void addTo(l)}>
                  <span>{l.name}</span>
                  {has && <span className={styles.added}>✓ Added</span>}
                </button>
              </div>
            );
          })}
          {lists.status === 'ready' && (
            <>
              <button type="button" role="menuitem" className={styles.newItem} onClick={() => {
                  setServerError(null);
                  setCreating(true);
                }}>
                + New watchlist…
              </button>
              <Link href="/markets" className={styles.manage}>
                Manage on Markets
              </Link>
            </>
          )}
        </div>
      )}
      {message && (
        <span className={styles.message} role="status">
          {message}
        </span>
      )}
      <WatchlistNameDialog
        open={creating}
        mode="create"
        existing={current}
        busy={busy}
        serverError={serverError}
        onSubmit={(name) => void submitCreate(name)}
        onCancel={() => setCreating(false)}
      />
    </span>
  );
}

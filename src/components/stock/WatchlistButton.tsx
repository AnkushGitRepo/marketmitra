'use client';

import Link from 'next/link';
import { useState } from 'react';
import styles from './WatchlistButton.module.css';

interface WatchlistRef {
  readonly id: string;
  readonly name: string;
}

type Lists = { readonly status: 'idle' | 'loading' | 'error' } | { readonly status: 'ready'; readonly value: WatchlistRef[] };

/** "+ Watchlist": picks one of the user's lists and adds this symbol to it. */
export function WatchlistButton({ symbol }: { readonly symbol: string }) {
  const [open, setOpen] = useState(false);
  const [lists, setLists] = useState<Lists>({ status: 'idle' });
  const [message, setMessage] = useState<string | null>(null);

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

  const addTo = async (list: WatchlistRef) => {
    try {
      const res = await fetch(`/api/watchlists/${list.id}/symbols`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      setMessage(res.ok ? `Added to ${list.name}.` : 'Could not add it. The list may be full.');
      if (res.ok) setOpen(false);
    } catch {
      setMessage('Could not reach the server. Try again.');
    }
  };

  return (
    <span className={styles.wrap}>
      <button type="button" className={styles.btn} aria-expanded={open} onClick={toggle}>
        + Watchlist
      </button>
      {open && (
        <div className={styles.menu} role="menu" aria-label="Add to watchlist">
          {lists.status === 'loading' && <p className={styles.muted}>Loading watchlists…</p>}
          {lists.status === 'error' && <p className={styles.muted}>Sign in to use watchlists.</p>}
          {lists.status === 'ready' && lists.value.length === 0 && (
            <p className={styles.muted}>
              No watchlists yet. <Link href="/markets">Create one on Markets</Link>.
            </p>
          )}
          {lists.status === 'ready' &&
            lists.value.map((l) => (
              <button key={l.id} type="button" role="menuitem" className={styles.item} onClick={() => void addTo(l)}>
                {l.name}
              </button>
            ))}
        </div>
      )}
      {message && (
        <span className={styles.message} role="status">
          {message}
        </span>
      )}
    </span>
  );
}

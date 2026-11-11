'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import styles from './TickerPill.module.css';

interface TickerPillProps {
  readonly symbol: string;
  /** True when the symbol is in the user's holdings. */
  readonly held: boolean;
}

interface QuoteInfo {
  readonly name: string | null;
  readonly price: number | null;
  readonly changePct: number | null;
}

interface WatchlistRef {
  readonly id: string;
  readonly name: string;
}

type Load<T> = { readonly status: 'idle' | 'loading' | 'error' } | { readonly status: 'ready'; readonly value: T };

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

async function fetchQuote(symbol: string): Promise<QuoteInfo> {
  const res = await fetch(`/api/stock/${encodeURIComponent(symbol)}?sections=company,quote`);
  if (!res.ok) throw new Error('not found');
  const body = (await res.json()) as { company?: { name?: string }; quote?: { price?: string | null; change_pct?: string | null } | null };
  return { name: body.company?.name ?? null, price: num(body.quote?.price), changePct: num(body.quote?.change_pct) };
}

/** A ticker tag that opens a popover: company, last price and day change, plus shortcuts to the stock, the screener and a watchlist. */
export function TickerPill({ symbol, held }: TickerPillProps) {
  const [open, setOpen] = useState(false);
  const [quote, setQuote] = useState<Load<QuoteInfo>>({ status: 'idle' });
  const [lists, setLists] = useState<Load<WatchlistRef[]>>({ status: 'idle' });
  const [picking, setPicking] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    setPicking(false);
    setMessage(null);
    if (next && quote.status === 'idle') {
      setQuote({ status: 'loading' });
      fetchQuote(symbol)
        .then((value) => setQuote({ status: 'ready', value }))
        .catch(() => setQuote({ status: 'error' }));
    }
  };

  const startAdd = () => {
    setPicking(true);
    setMessage(null);
    if (lists.status !== 'idle') return;
    setLists({ status: 'loading' });
    fetch('/api/wishlists')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('unavailable'))))
      .then((body: { data?: WatchlistRef[] }) => setLists({ status: 'ready', value: body.data ?? [] }))
      .catch(() => setLists({ status: 'error' }));
  };

  const addTo = async (list: WatchlistRef) => {
    try {
      const res = await fetch(`/api/wishlists/${list.id}/symbols`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol }),
      });
      setMessage(res.ok ? `Added to ${list.name}.` : 'Could not add it. The list may be full.');
      if (res.ok) setPicking(false);
    } catch {
      setMessage('Could not reach the server. Try again.');
    }
  };

  const q = quote.status === 'ready' ? quote.value : null;
  const up = q?.changePct != null && q.changePct >= 0;

  return (
    <span className={styles.wrap} ref={ref}>
      <button type="button" className={styles.pill} aria-expanded={open} aria-controls={id} aria-haspopup="dialog" onClick={toggle}>
        {symbol}
        {held && <span className={styles.holding}>Holding</span>}
      </button>
      {open && (
        <div id={id} role="dialog" aria-label={`${symbol} quick view`} className={styles.popover}>
          <p className={styles.name}>{q?.name ?? symbol}</p>
          <p className={styles.symbol}>{symbol}</p>
          {quote.status === 'loading' && <p className={styles.muted}>Loading price…</p>}
          {quote.status === 'error' && <p className={styles.muted}>Price unavailable right now.</p>}
          {q && q.price !== null && (
            <p className={styles.price}>
              ₹{q.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              {q.changePct !== null && (
                <span className={`${styles.change} ${up ? styles.up : styles.down}`}>
                  <span aria-hidden="true">{up ? '▲' : '▼'}</span> {up ? '+' : ''}
                  {q.changePct.toFixed(2)}%
                </span>
              )}
            </p>
          )}
          <div className={styles.actions}>
            <Link href={`/stock/${encodeURIComponent(symbol.toLowerCase())}`} className={styles.action}>
              Open stock
            </Link>
            <Link href={`/screener?q=${encodeURIComponent(symbol)}`} className={styles.action}>
              View in Screener
            </Link>
            {!picking ? (
              <button type="button" className={styles.action} onClick={startAdd}>
                Add to Watchlist
              </button>
            ) : (
              <div className={styles.lists}>
                {lists.status === 'loading' && <p className={styles.muted}>Loading watchlists…</p>}
                {lists.status === 'error' && <p className={styles.muted}>Sign in to use watchlists.</p>}
                {lists.status === 'ready' && lists.value.length === 0 && (
                  <p className={styles.muted}>
                    No watchlists yet. <Link href="/markets">Create one on Markets</Link>.
                  </p>
                )}
                {lists.status === 'ready' &&
                  lists.value.map((l) => (
                    <button key={l.id} type="button" className={styles.listBtn} onClick={() => void addTo(l)}>
                      {l.name}
                    </button>
                  ))}
              </div>
            )}
          </div>
          {message && (
            <p className={styles.message} role="status">
              {message}
            </p>
          )}
        </div>
      )}
    </span>
  );
}

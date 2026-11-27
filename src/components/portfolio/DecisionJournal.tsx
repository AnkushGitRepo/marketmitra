'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatInr } from '@/lib/dashboard/format';
import { MAX_POST_MORTEM } from '@/lib/tradeJournal/snapshot';
import type { JournalSnapshot } from '@/lib/tradeJournal/types';
import { EVENT_LABEL, groupBySymbol, outcomeFor } from '@/lib/tradeJournal/view';
import styles from './DecisionJournal.module.css';

interface DecisionJournalProps {
  readonly entries: readonly JournalSnapshot[];
  /** symbol -> live price for holdings still held. */
  readonly prices: Readonly<Record<string, number | null>>;
}

const dash = '—';
const money = (n: number | null) => (n === null ? dash : formatInr(n));
const multiple = (n: number | null, suffix: string) => (n === null ? dash : `${n.toFixed(1)}${suffix}`);
const dateOf = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

function quantityText(e: JournalSnapshot): string {
  const q = (s: JournalSnapshot['after']) => (s ? String(s.quantity) : '0');
  return e.before === null ? `${q(e.after)} shares at ${money(e.after?.avgPrice ?? null)}` : `${q(e.before)} → ${q(e.after)} shares`;
}

export function DecisionJournal({ entries, prices }: DecisionJournalProps) {
  const heldSymbols = new Set(Object.keys(prices));
  const groups = groupBySymbol(entries, heldSymbols);

  return (
    <section className={styles.panel} aria-labelledby="journal-title">
      <div className={styles.header}>
        <h2 id="journal-title" className={styles.title}>Decision journal</h2>
        <p className={styles.hint}>Saved automatically when you add, change or remove a position: what you knew then, beside what happened.</p>
      </div>
      {groups.length === 0 ? (
        <p className={styles.empty}>No entries yet. The next position you add or change is recorded here.</p>
      ) : (
        groups.map((g) => (
          <div key={g.symbol} className={styles.group}>
            <h3 className={styles.symbol}>
              <Link href={`/stock/${encodeURIComponent(g.symbol)}`}>{g.symbol}</Link>
              <span className={styles.badge}>{g.held ? 'Held' : 'Closed'}</span>
            </h3>
            <ul className={styles.list}>
              {g.entries.map((e) => (
                <EntryItem key={e.id} entry={e} nowPrice={prices[g.symbol] ?? null} />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}

function EntryItem({ entry, nowPrice }: { readonly entry: JournalSnapshot; readonly nowPrice: number | null }) {
  const router = useRouter();
  const outcome = outcomeFor(entry, nowPrice);
  const [text, setText] = useState(entry.postMortem ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const savePostMortem = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/journal/${entry.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ postMortem: text.trim() || null }),
      });
      if (res.ok) router.refresh();
      else setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Could not save this reflection.');
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className={styles.item}>
      <p className={styles.line}>
        <strong>{EVENT_LABEL[entry.event]}</strong> · {dateOf(entry.at)} · {quantityText(entry)}
      </p>
      <dl className={styles.facts}>
        <div><dt>Price then</dt><dd>{money(entry.marketPrice)}</dd></div>
        <div><dt>P/E</dt><dd>{multiple(entry.pe, 'x')}</dd></div>
        <div><dt>ROCE</dt><dd>{multiple(entry.roce, '%')}</dd></div>
        <div><dt>Guardrails</dt><dd>{entry.guardrails.length > 0 ? entry.guardrails.map((g) => g.replace('_', ' ')).join(', ') : 'none'}</dd></div>
        {outcome ? (
          <div data-tone={outcome.pct === null ? 'none' : outcome.pct >= 0 ? 'up' : 'down'}>
            <dt>{outcome.label}</dt>
            <dd>{outcome.pct === null ? 'not available' : `${outcome.pct >= 0 ? '+' : ''}${outcome.pct.toFixed(1)}%`}</dd>
          </div>
        ) : null}
      </dl>
      {entry.reason ? <p className={styles.reason}>Your reason: {entry.reason}</p> : null}
      {entry.thesis ? (
        <details className={styles.thesis}>
          <summary>Thesis at the time: {entry.thesis.title}</summary>
          <p>{entry.thesis.body}</p>
        </details>
      ) : (
        <p className={styles.muted}>No note about this stock existed then.</p>
      )}
      {entry.event === 'exit' ? <p className={styles.muted}>The price is the live quote when you removed it, not a recorded sale price.</p> : null}
      {entry.event === 'exit' || entry.postMortem ? (
        <div className={styles.post}>
          <label>
            <span>What I got right or wrong</span>
            <textarea value={text} maxLength={MAX_POST_MORTEM} rows={3} onChange={(e) => setText(e.target.value)} />
          </label>
          <button type="button" className={styles.save} disabled={busy || text.trim() === (entry.postMortem ?? '')} onClick={savePostMortem}>
            Save reflection
          </button>
          {error ? <p className={styles.error} role="alert">{error}</p> : null}
        </div>
      ) : null}
    </li>
  );
}

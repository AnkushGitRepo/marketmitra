'use client';

import { useEffect, useState } from 'react';
import { EntryItem } from '@/components/portfolio/DecisionJournal';
import { formatInr } from '@/lib/dashboard/format';
import { useMask } from '@/lib/dashboard/MaskContext';
import { MAX_BODY } from '@/lib/notes/limits';
import { THESIS_PLACEHOLDER, entrySnapshot, findThesisNote, pnlPct, thesisTitle } from '@/lib/stock/thesis';
import { shortDate } from '@/lib/tax/format';
import type { JournalSnapshot } from '@/lib/tradeJournal/types';
import styles from './ThesisCard.module.css';

interface Position {
  readonly quantity: number;
  readonly avgPrice: number;
  readonly ltp: number | null;
  readonly purchaseDate: string | null;
}

interface Loaded {
  readonly position: Position | null;
  readonly noteId: string | null;
  readonly thesis: string;
  readonly entries: JournalSnapshot[];
  readonly livePrice: number | null;
}

type State = { readonly status: 'loading' } | { readonly status: 'error' } | ({ readonly status: 'ready' } & Loaded);

async function getData<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(url);
  return ((await res.json()) as { data: T }).data;
}

interface TaxLot { lot: { symbol: string; quantity: number; avgPrice: number; ltp: number | null; purchaseDate: string | null } }
interface NoteRow { id: string; title: string; body: string; symbol: string | null; updatedAt: string }

/** Everything the card shows, fetched together; a failed request leaves the card in its error state. */
async function fetchState(sym: string): Promise<State> {
  try {
    const [tax, notes, entries] = await Promise.all([
      getData<{ lots: TaxLot[] }>('/api/tax'),
      getData<NoteRow[]>('/api/notes'),
      getData<JournalSnapshot[]>(`/api/journal?symbol=${encodeURIComponent(sym)}`),
    ]);
    const held = tax.lots.find((l) => l.lot.symbol.toUpperCase() === sym)?.lot ?? null;
    const note = findThesisNote(notes, sym);
    return {
      status: 'ready',
      position: held ? { quantity: held.quantity, avgPrice: held.avgPrice, ltp: held.ltp, purchaseDate: held.purchaseDate } : null,
      noteId: note?.id ?? null,
      thesis: note?.body ?? '',
      entries,
      livePrice: held?.ltp ?? null,
    };
  } catch {
    return { status: 'error' };
  }
}

/** The card on a stock's My journal tab (your own record, not the analyst's): what you hold, what you thought, and what you wrote down at the time. */
export function ThesisCard({ symbol }: { readonly symbol: string }) {
  const { masked } = useMask();
  const sym = symbol.toUpperCase();
  const [state, setState] = useState<State>({ status: 'loading' });
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchState(sym).then((next) => {
      if (alive) setState(next);
    });
    return () => {
      alive = false;
    };
  }, [sym]);

  if (state.status === 'loading') return <section className={styles.card} aria-busy="true"><p className={styles.muted}>Loading your thesis…</p></section>;
  if (state.status === 'error') return <section className={styles.card}><p className={styles.muted}>Could not load your thesis and entry snapshot. Reload to try again.</p></section>;

  const { position, noteId, thesis, entries, livePrice } = state;
  const text = draft ?? thesis;
  const entry = entrySnapshot(entries);
  const pnl = position ? pnlPct(position.avgPrice, position.ltp) : null;

  const save = async () => {
    const body = text.trim();
    if (!body) return setMessage({ text: 'Write something first.', error: true });
    setBusy(true);
    setMessage(null);
    try {
      const payload = { title: thesisTitle(sym), body, symbol: sym };
      const res = await fetch(noteId ? `/api/notes/${noteId}` : '/api/notes', { method: noteId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? 'Could not save.');
      setMessage({ text: 'Saved. It is also in your notes.', error: false });
      setDraft(null);
      setState(await fetchState(sym));
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : 'Could not save.', error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="thesis-title">
      <h2 id="thesis-title" className={styles.title}>Investment thesis &amp; entry snapshot</h2>

      {position ? (
        <dl className={styles.facts}>
          <div><dt>Quantity</dt><dd>{position.quantity}</dd></div>
          <div><dt>Average cost</dt><dd>{formatInr(position.avgPrice, 2, masked)}</dd></div>
          <div><dt>Entry date</dt><dd>{position.purchaseDate ? shortDate(position.purchaseDate) : 'not set'}</dd></div>
          <div data-tone={pnl === null ? 'none' : pnl >= 0 ? 'up' : 'down'}><dt>Return on cost</dt><dd>{pnl === null ? '—' : `${pnl >= 0 ? '+' : ''}${pnl.toFixed(1)}%`}</dd></div>
          {entry ? <div><dt>P/E at entry</dt><dd>{entry.pe === null ? '—' : `${entry.pe.toFixed(1)}x`}</dd></div> : null}
          {entry ? <div><dt>ROCE at entry</dt><dd>{entry.roce === null ? '—' : `${entry.roce.toFixed(1)}%`}</dd></div> : null}
        </dl>
      ) : (
        <p className={styles.muted}>You do not hold {sym} right now. You can still write down why you are watching it.</p>
      )}
      {entry?.reason ? <p className={styles.why}>Why you bought: {entry.reason}</p> : null}

      <label className={styles.field}>
        <span>My investment thesis &amp; exit trigger</span>
        <textarea value={text} rows={5} maxLength={MAX_BODY} placeholder={THESIS_PLACEHOLDER} onChange={(e) => { setDraft(e.target.value); setMessage(null); }} />
      </label>
      <div className={styles.actions}>
        <button type="button" className={styles.save} disabled={busy || draft === null || draft.trim() === thesis.trim()} onClick={save}>Save thesis</button>
        {message ? <span className={message.error ? styles.error : styles.muted} role={message.error ? 'alert' : 'status'}>{message.text}</span> : null}
      </div>

      {entries.length > 0 ? (
        <div className={styles.journal}>
          <h3 className={styles.h3}>Decisions on {sym}</h3>
          <ul className={styles.list}>
            {entries.map((e) => <EntryItem key={e.id} entry={e} nowPrice={livePrice} />)}
          </ul>
        </div>
      ) : (
        <p className={styles.muted}>No decisions recorded yet. Adding, changing or removing a position saves one here.</p>
      )}
    </section>
  );
}

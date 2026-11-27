'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { buildBoard, type BoardRow, type ConvictionEntry, type TargetState } from '@/lib/conviction/board';
import { CONVICTION_TAGS, MAX_WAIT_FOR, type ConvictionTag, type TargetDirection } from '@/lib/conviction/schema';
import { formatInr } from '@/lib/dashboard/format';
import styles from './ConvictionBoard.module.css';

interface ConvictionBoardProps {
  readonly entries: readonly ConvictionEntry[];
  /** symbol -> last price. A symbol missing here shows "no price" rather than a guess. */
  readonly prices: Readonly<Record<string, number | undefined>>;
  /** The user's notes, offered as the linked thesis. */
  readonly notes: readonly { id: string; title: string }[];
  /** Symbols from the user's watchlists and holdings, offered when adding. */
  readonly suggestions: readonly string[];
}

const TAG_LABEL: Record<ConvictionTag, string> = { high: 'High', tracking: 'Tracking', wait: 'Waiting' };

const STATE_LABEL: Record<TargetState, string> = {
  reached: 'Target reached',
  near: 'Near target',
  waiting: 'Waiting',
  no_price: 'No price',
  no_target: 'No target',
};

async function save(body: Record<string, unknown>): Promise<string | null> {
  try {
    const res = await fetch('/api/conviction', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) return null;
    const data = (await res.json().catch(() => null)) as { error?: string } | null;
    return data?.error ?? 'Could not save this entry.';
  } catch {
    return 'Could not reach the server. Try again.';
  }
}

function targetText(row: BoardRow): string {
  if (row.targetPrice === null) return '—';
  const side = row.targetDirection === 'at_or_below' ? '≤' : '≥';
  return `${side} ${formatInr(row.targetPrice)}`;
}

function distanceText(row: BoardRow): string {
  if (row.state === 'reached') return 'At or past target';
  if (row.distancePct === null) return '—';
  return `${row.distancePct.toFixed(1)}% away`;
}

export function ConvictionBoard({ entries, prices, notes, suggestions }: ConvictionBoardProps) {
  const router = useRouter();
  const rows = buildBoard(entries, prices);
  const [symbol, setSymbol] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (task: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    const problem = await task();
    setBusy(false);
    if (problem) setError(problem);
    else router.refresh();
    return problem === null;
  };

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = symbol.trim();
    if (!clean) return;
    if (await run(() => save({ symbol: clean }))) {
      setSymbol('');
      setEditing(clean.toUpperCase());
    }
  };

  const remove = (row: BoardRow) =>
    run(async () => {
      const res = await fetch(`/api/conviction/${encodeURIComponent(row.symbol)}`, { method: 'DELETE' }).catch(() => null);
      return res?.ok ? null : 'Could not remove this entry.';
    });

  const noteTitle = (id: string | null) => notes.find((n) => n.id === id)?.title ?? null;

  return (
    <section className={styles.panel} aria-labelledby="conviction-title">
      <div className={styles.header}>
        <h2 id="conviction-title" className={styles.title}>Conviction board</h2>
        <p className={styles.hint}>Name a price and a note for each stock. You get an alert when it is reached.</p>
      </div>

      <form className={styles.addRow} onSubmit={add}>
        <input
          className={styles.input}
          list="conviction-suggestions"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          placeholder="Symbol, e.g. TCS"
          maxLength={30}
          aria-label="Symbol to add"
        />
        <datalist id="conviction-suggestions">{suggestions.map((s) => <option key={s} value={s} />)}</datalist>
        <button className={styles.primary} type="submit" disabled={busy || !symbol.trim()}>Add</button>
      </form>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      {rows.length === 0 ? (
        <p className={styles.empty}>Nothing on the board yet. Add a stock you are researching.</p>
      ) : (
        <ul className={styles.list}>
          {rows.map((row) => (
            <li key={row.id} className={styles.item} data-state={row.state}>
              <div className={styles.line}>
                <Link href={`/stock/${encodeURIComponent(row.symbol)}`} className={styles.symbol}>{row.symbol}</Link>
                <span className={styles.tag} data-tag={row.tag}>
                  {TAG_LABEL[row.tag]}{row.tag === 'wait' && row.waitFor ? `: ${row.waitFor}` : ''}
                </span>
                <span className={styles.price}>{row.price === null ? '—' : formatInr(row.price)}</span>
                <span className={styles.target}>{targetText(row)}</span>
                <span className={styles.state} data-state={row.state}>{STATE_LABEL[row.state]} · {distanceText(row)}</span>
                <span className={styles.actions}>
                  <button type="button" className={styles.link} onClick={() => setEditing(editing === row.symbol ? null : row.symbol)}>
                    {editing === row.symbol ? 'Close' : 'Edit'}
                  </button>
                  <button type="button" className={styles.danger} disabled={busy} onClick={() => remove(row)}>Remove</button>
                </span>
              </div>
              {row.noteId && noteTitle(row.noteId) ? (
                <p className={styles.note}>Thesis: <Link href={`/notes?note=${encodeURIComponent(row.noteId)}`}>{noteTitle(row.noteId)}</Link></p>
              ) : null}
              {editing === row.symbol ? (
                <EntryEditor row={row} notes={notes} busy={busy} onSave={(body) => run(() => save({ symbol: row.symbol, ...body })).then((ok) => ok && setEditing(null))} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

interface EntryEditorProps {
  readonly row: BoardRow;
  readonly notes: readonly { id: string; title: string }[];
  readonly busy: boolean;
  readonly onSave: (body: {
    tag: ConvictionTag;
    waitFor: string | null;
    targetPrice: number | null;
    targetDirection: TargetDirection;
    noteId: string | null;
  }) => void;
}

function EntryEditor({ row, notes, busy, onSave }: EntryEditorProps) {
  const [tag, setTag] = useState<ConvictionTag>(row.tag);
  const [waitFor, setWaitFor] = useState(row.waitFor ?? '');
  const [target, setTarget] = useState(row.targetPrice === null ? '' : String(row.targetPrice));
  const [direction, setDirection] = useState<TargetDirection>(row.targetDirection);
  const [noteId, setNoteId] = useState(row.noteId ?? '');

  const parsed = target.trim() === '' ? null : Number(target);
  const invalid = parsed !== null && !(Number.isFinite(parsed) && parsed > 0);

  return (
    <form
      className={styles.editor}
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        onSave({ tag, waitFor: tag === 'wait' ? waitFor.trim() || null : null, targetPrice: parsed, targetDirection: direction, noteId: noteId || null });
      }}
    >
      <label className={styles.field}>
        <span>Conviction</span>
        <select value={tag} onChange={(e) => setTag(e.target.value as ConvictionTag)}>
          {CONVICTION_TAGS.map((t) => <option key={t} value={t}>{TAG_LABEL[t]}</option>)}
        </select>
      </label>
      {tag === 'wait' ? (
        <label className={styles.field}>
          <span>Waiting for</span>
          <input value={waitFor} maxLength={MAX_WAIT_FOR} onChange={(e) => setWaitFor(e.target.value)} placeholder="e.g. Q3 results" />
        </label>
      ) : null}
      <label className={styles.field}>
        <span>Target entry price (₹)</span>
        <input inputMode="decimal" value={target} onChange={(e) => setTarget(e.target.value)} placeholder="No target" aria-invalid={invalid} />
      </label>
      <label className={styles.field}>
        <span>Alert when price is</span>
        <select value={direction} onChange={(e) => setDirection(e.target.value as TargetDirection)}>
          <option value="at_or_below">At or below the target</option>
          <option value="at_or_above">At or above the target</option>
        </select>
      </label>
      <label className={styles.field}>
        <span>Thesis note</span>
        <select value={noteId} onChange={(e) => setNoteId(e.target.value)}>
          <option value="">None</option>
          {notes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}
        </select>
      </label>
      <button className={styles.primary} type="submit" disabled={busy || invalid}>Save</button>
      {invalid ? <p className={styles.error}>Enter a price above zero, or leave it empty.</p> : null}
    </form>
  );
}

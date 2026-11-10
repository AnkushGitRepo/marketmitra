'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { UserNote } from '@/lib/notes/userNotes';
import styles from './page.module.css';

interface Props {
  notes: UserNote[];
}

interface Draft {
  id: string | null;
  title: string;
  body: string;
  symbol: string;
}

const EMPTY: Draft = { id: null, title: '', body: '', symbol: '' };

export function NotesPageClient({ notes }: Props) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startNew = () => {
    setError(null);
    setDraft(EMPTY);
  };
  const startEdit = (n: UserNote) => {
    setError(null);
    setDraft({ id: n.id, title: n.title, body: n.body, symbol: n.symbol ?? '' });
  };
  const cancel = () => {
    setDraft(null);
    setError(null);
  };

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim() || !draft.body.trim()) {
      setError('Title and body are both required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(draft.id ? `/api/notes/${draft.id}` : '/api/notes', {
        method: draft.id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: draft.title.trim(),
          body: draft.body.trim(),
          symbol: draft.symbol.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Could not save the note.');
        return;
      }
      setDraft(null);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (n: UserNote) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/notes/${n.id}`, { method: 'DELETE' });
      if (res.ok) router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.pageRoot}>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>Notes</p>
          <h1 className={styles.h1}>Research notes</h1>
        </div>
        {!draft && (
          <button type="button" className={styles.btnPrimary} onClick={startNew}>
            New note
          </button>
        )}
      </div>

      <p className={styles.introNote}>
        Private notes on your holdings, sectors, or ideas. Mitra and the AI insight
        cards search these alongside indexed news and filings — so a note on why you
        hold a stock informs what they tell you about it.
      </p>

      {draft && (
        <div className={`${styles.card} ${styles.formCard}`}>
          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="note-title">
                Title
              </label>
              <input
                id="note-title"
                className={styles.input}
                value={draft.title}
                maxLength={140}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="e.g. Why I hold TCS"
              />
            </div>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="note-body">
                Note
              </label>
              <textarea
                id="note-body"
                className={styles.textarea}
                value={draft.body}
                maxLength={4000}
                onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                placeholder="What you want to remember…"
              />
            </div>
            <div className={styles.formRow}>
              <div className={styles.field}>
                <label className={styles.fieldLabel} htmlFor="note-symbol">
                  Symbol (optional)
                </label>
                <input
                  id="note-symbol"
                  className={`${styles.input} ${styles.symbolInput}`}
                  value={draft.symbol}
                  maxLength={30}
                  onChange={(e) => setDraft({ ...draft, symbol: e.target.value.toUpperCase() })}
                  placeholder="RELIANCE"
                />
              </div>
            </div>
            {error && <p className={styles.error}>{error}</p>}
            <div className={styles.formActions}>
              <button type="button" className={styles.btnPrimary} onClick={save} disabled={busy}>
                {busy ? 'Saving…' : draft.id ? 'Save changes' : 'Add note'}
              </button>
              <button type="button" className={styles.btnGhost} onClick={cancel} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {notes.length === 0 && !draft ? (
        <div className={styles.emptyCard}>
          <p className={styles.emptyText}>
            No notes yet. Add one — it becomes part of what the AI surfaces knows about
            your portfolio.
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {notes.map((n) => (
            <div key={n.id} className={styles.noteItem}>
              <div className={styles.noteHead}>
                <h2 className={styles.noteTitle}>{n.title}</h2>
                {n.symbol && <span className={styles.noteSymbol}>{n.symbol}</span>}
              </div>
              <p className={styles.noteBody}>{n.body}</p>
              <div className={styles.noteMeta}>
                <span>updated {new Date(n.updatedAt).toLocaleDateString()}</span>
                <span className={styles.spacer} />
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => startEdit(n)}
                  disabled={busy || draft !== null}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className={styles.btnGhost}
                  onClick={() => remove(n)}
                  disabled={busy || draft !== null}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

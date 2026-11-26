'use client';

import Link from 'next/link';
import { useState } from 'react';
import { addTag, removeTag, type TagChange } from '@/lib/notes/tags';
import { noteTickers, type VaultNote } from '@/lib/notes/vault';
import styles from './NotesVault.module.css';

interface NoteTagsProps {
  readonly note: Pick<VaultNote, 'symbol' | 'tickers'>;
  readonly busy: boolean;
  /** Saves the new symbol and tickers; resolves to an error message when it could not. */
  readonly onChange: (change: Extract<TagChange, { ok: true }>) => Promise<string | null>;
}

/** A note's tickers as chips that link to the stock, with a remove button each and an inline "+ Tag" field. */
export function NoteTags({ note, busy, onChange }: NoteTagsProps) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const tags = noteTickers(note);

  const commit = async (change: TagChange) => {
    if (!change.ok) {
      setError(change.error);
      return;
    }
    const failed = await onChange(change);
    setError(failed);
    if (!failed) {
      setText('');
      setAdding(false);
    }
  };

  return (
    <div className={styles.tags}>
      <ul className={styles.tagList} aria-label="Tickers this note is about">
        {tags.map((t) => (
          <li key={t} className={styles.tag}>
            <Link href={`/stock/${encodeURIComponent(t)}`} className={styles.tagLink}>
              {t}
            </Link>
            <button type="button" className={styles.tagRemove} data-print-hide aria-label={`Remove ${t}`} disabled={busy} onClick={() => commit(removeTag(note, t))}>
              ×
            </button>
          </li>
        ))}
        <li data-print-hide>
          {adding ? (
            <form
              className={styles.tagForm}
              onSubmit={(e) => {
                e.preventDefault();
                void commit(addTag(note, text));
              }}
            >
              <input
                className={styles.tagInput}
                value={text}
                autoFocus
                maxLength={31}
                aria-label="Ticker to add"
                placeholder="BHARTIARTL"
                onChange={(e) => {
                  setText(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setAdding(false);
                    setText('');
                    setError(null);
                  }
                }}
              />
              <button type="submit" className={styles.tagAdd} disabled={busy || text.trim() === ''}>
                Add
              </button>
            </form>
          ) : (
            <button type="button" className={styles.tagAdd} disabled={busy} onClick={() => setAdding(true)}>
              + Tag
            </button>
          )}
        </li>
      </ul>
      {error && <p className={styles.error} role="alert">{error}</p>}
    </div>
  );
}

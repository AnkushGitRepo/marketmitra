'use client';

import { useState } from 'react';
import { MAX_BODY, MAX_RESEARCH_BODY, MAX_TITLE, type NoteSource } from '@/lib/notes/limits';
import styles from './NotesVault.module.css';

export interface NoteDraft {
  readonly id: string | null;
  readonly title: string;
  readonly body: string;
  readonly symbol: string;
  readonly tickers: readonly string[];
  readonly source: NoteSource;
}

export const EMPTY_DRAFT: NoteDraft = { id: null, title: '', body: '', symbol: '', tickers: [], source: 'manual' };

interface NoteEditorProps {
  readonly initial: NoteDraft;
  readonly busy: boolean;
  readonly error: string | null;
  readonly onSave: (draft: NoteDraft) => void;
  readonly onCancel: () => void;
}

export function NoteEditor({ initial, busy, error, onSave, onCancel }: NoteEditorProps) {
  const [draft, setDraft] = useState(initial);
  return (
    <form
      className={styles.editor}
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <label className={styles.fieldLabel} htmlFor="note-title">
        Title
      </label>
      <input
        id="note-title"
        className={styles.input}
        value={draft.title}
        maxLength={MAX_TITLE}
        onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        placeholder="e.g. Why I hold TCS"
      />
      <label className={styles.fieldLabel} htmlFor="note-body">
        Note
      </label>
      <textarea
        id="note-body"
        className={styles.textarea}
        value={draft.body}
        maxLength={draft.source === 'research' ? MAX_RESEARCH_BODY : MAX_BODY}
        onChange={(e) => setDraft({ ...draft, body: e.target.value })}
        placeholder="What you want to remember…"
      />
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
      {error && <p className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="submit" className={styles.btnPrimary} disabled={busy}>
          {busy ? 'Saving…' : draft.id ? 'Save changes' : 'Add note'}
        </button>
        <button type="button" className={styles.btn} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
    </form>
  );
}

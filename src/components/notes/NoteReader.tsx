'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { MarkdownLite } from '@/components/MarkdownLite';
import { printElement } from '@/lib/print/printElement';
import { askMitraHref, noteTickers, type VaultNote } from '@/lib/notes/vault';
import styles from './NotesVault.module.css';

interface NoteReaderProps {
  readonly note: VaultNote;
  readonly busy: boolean;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onBack: () => void;
}

const dateLabel = (d: Date | string): string =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function NoteReader({ note, busy, onEdit, onDelete, onBack }: NoteReaderProps) {
  const printRef = useRef<HTMLElement>(null);
  return (
    <article className={styles.reader} ref={printRef}>
      <button type="button" className={styles.back} onClick={onBack} data-print-hide>
        ← All notes
      </button>
      <p className={styles.readerKind}>
        {note.source === 'research' ? 'Saved research' : 'Note'} · {dateLabel(note.updatedAt)}
      </p>
      <h2 className={styles.readerTitle}>{note.title}</h2>
      {noteTickers(note).length > 0 && (
        <p className={styles.chips}>
          {noteTickers(note).map((t) => (
            <Link key={t} href={`/stock/${encodeURIComponent(t)}`} className={styles.ticker}>
              {t}
            </Link>
          ))}
        </p>
      )}
      <MarkdownLite text={note.body} className={styles.body} />
      <div className={styles.actions} data-print-hide>
        <button type="button" className={styles.btn} onClick={() => printRef.current && printElement(printRef.current, note.title)}>
          Export PDF
        </button>
        <Link className={styles.btn} href={askMitraHref(note.title)}>
          Ask Mitra about this note
        </Link>
        <span className={styles.spacer} />
        <button type="button" className={styles.btn} onClick={onEdit} disabled={busy}>
          Edit
        </button>
        <button type="button" className={styles.btn} onClick={onDelete} disabled={busy}>
          Delete
        </button>
      </div>
    </article>
  );
}

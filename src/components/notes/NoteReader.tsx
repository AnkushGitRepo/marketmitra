'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { MarkdownLite } from '@/components/MarkdownLite';
import type { NoteFormat } from '@/lib/notes/exportNote';
import { printElement } from '@/lib/print/printElement';
import type { TagChange } from '@/lib/notes/tags';
import { askMitraHref, type VaultNote } from '@/lib/notes/vault';
import { NoteExportMenu } from './NoteExportMenu';
import { NoteTags } from './NoteTags';
import styles from './NotesVault.module.css';

interface NoteReaderProps {
  readonly note: VaultNote;
  readonly busy: boolean;
  /** The list column is hidden, so the note has the full width. */
  readonly listHidden: boolean;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
  readonly onBack: () => void;
  readonly onToggleList: () => void;
  readonly onTagsChange: (change: Extract<TagChange, { ok: true }>) => Promise<string | null>;
  /** Makes a Markdown, text or Word file of the note; the PDF is the browser's print of the reader. */
  readonly onExport: (format: Exclude<NoteFormat, 'pdf'>) => Promise<void>;
}

const dateLabel = (d: Date | string): string =>
  new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

export function NoteReader({ note, busy, listHidden, onEdit, onDelete, onBack, onToggleList, onTagsChange, onExport }: NoteReaderProps) {
  const printRef = useRef<HTMLElement>(null);
  const exportNote = async (format: NoteFormat) => {
    if (format === 'pdf') {
      if (printRef.current) printElement(printRef.current, note.title);
      return;
    }
    await onExport(format);
  };

  return (
    <article className={styles.reader} ref={printRef}>
      <div className={styles.readerBar} data-print-hide>
        <button type="button" className={styles.back} onClick={onBack}>
          ← All notes
        </button>
        <button type="button" className={styles.listToggle} onClick={onToggleList} aria-pressed={listHidden} title={listHidden ? 'Show the note list' : 'Hide the note list for full-width reading'}>
          <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
            <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" />
            <path d="M6 3v10" stroke="currentColor" strokeWidth="1.3" />
            {!listHidden && <rect x="2.4" y="3.4" width="3" height="9.2" fill="currentColor" opacity="0.25" />}
          </svg>
          {listHidden ? 'Show list' : 'Hide list'}
        </button>
        <span className={styles.spacer} />
        <div className={styles.toolbar} role="toolbar" aria-label="Note actions">
          <button type="button" className={styles.btn} onClick={onEdit} disabled={busy}>
            Edit
          </button>
          <Link className={styles.btn} href={askMitraHref(note.title)}>
            Ask Mitra
          </Link>
          <NoteExportMenu onExport={exportNote} />
          <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={onDelete} disabled={busy}>
            Delete
          </button>
        </div>
      </div>
      <p className={styles.readerKind}>
        {note.source === 'research' ? 'Saved research' : 'Note'} · {dateLabel(note.updatedAt)}
      </p>
      <h2 className={styles.readerTitle}>{note.title}</h2>
      <NoteTags note={note} busy={busy} onChange={onTagsChange} />
      <MarkdownLite text={note.body} className={styles.body} />
    </article>
  );
}

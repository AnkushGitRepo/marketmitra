'use client';

import { useEffect, useId, useRef, useState } from 'react';
import menu from '@/components/research/report/ExportMenu.module.css';
import { NOTE_FORMATS, type NoteFormat } from '@/lib/notes/exportNote';
import styles from './NotesVault.module.css';

interface NoteExportMenuProps {
  /** Builds and hands over the file; rejects when it could not be made. */
  readonly onExport: (format: NoteFormat) => Promise<void>;
}

/** One "Export" button that offers the four formats, opening to the left so it stays inside the card. */
export function NoteExportMenu({ onExport }: NoteExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<NoteFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);

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

  const choose = async (format: NoteFormat) => {
    setBusy(format);
    setError(null);
    try {
      await onExport(format);
      setOpen(false);
    } catch {
      setError('Could not create that file. Try another format.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`${menu.wrap} ${styles.exportWrap}`} ref={ref}>
      <button type="button" className={styles.btn} aria-haspopup="menu" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        Export <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div id={id} role="menu" className={menu.menu}>
          {NOTE_FORMATS.map((f) => (
            <button key={f.id} type="button" role="menuitem" className={menu.item} disabled={busy !== null} onClick={() => choose(f.id)}>
              <span>{busy === f.id ? 'Preparing…' : f.label}</span>
              <small>{f.hint}</small>
            </button>
          ))}
          {error && <p className={styles.error} role="alert">{error}</p>}
        </div>
      )}
    </div>
  );
}

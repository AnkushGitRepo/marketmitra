'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ReportChapter } from '@/lib/research/report/chapters';
import type { ExportMeta } from '@/lib/research/report/export/meta';
import { EXPORT_FORMATS, exportReport, type ExportFormat } from './exportReport';
import styles from './ExportMenu.module.css';

interface ExportMenuProps {
  readonly chapters: readonly ReportChapter[];
  /** Null until the report has finished: the menu is off until then, because the files should hold every chapter. */
  readonly meta: ExportMeta | null;
}

/** One "Export report" button that offers the four formats. */
export function ExportMenu({ chapters, meta }: ExportMenuProps) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const disabled = meta === null;

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

  const choose = async (format: ExportFormat) => {
    if (!meta) return;
    setBusy(format);
    setError(null);
    try {
      await exportReport(format, chapters, meta);
      setOpen(false);
    } catch {
      setError('Could not create that file. Try another format.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={styles.wrap} ref={ref} data-print-hide>
      <button
        type="button"
        className={styles.button}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        disabled={disabled}
        title={disabled ? 'Available when all chapters are finished' : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        Export report <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div id={id} role="menu" className={styles.menu}>
          {EXPORT_FORMATS.map((f) => (
            <button key={f.id} type="button" role="menuitem" className={styles.item} disabled={busy !== null} onClick={() => choose(f.id)}>
              <span>{busy === f.id ? 'Preparing…' : f.label}</span>
              <small>{f.hint}</small>
            </button>
          ))}
          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}
    </div>
  );
}

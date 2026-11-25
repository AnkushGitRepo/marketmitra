'use client';

import Link from 'next/link';
import { useState, type ReactNode, type RefObject } from 'react';
import type { SuggestedNote } from '@/lib/research/saveNote';
import { noteBody } from '@/lib/research/saveNote';
import { printElement } from '@/lib/print/printElement';
import styles from './ReportActions.module.css';

interface ReportActionsProps {
  readonly report: { content: string; model: string; generatedAt: string; note?: SuggestedNote };
  /** The element Export PDF prints: the report, without the page around it. */
  readonly printRef: RefObject<HTMLElement | null>;
  /** Replaces the default Export PDF button (the company report has its own menu of formats). */
  readonly exportControl?: ReactNode;
}

type SaveState = { status: 'idle' } | { status: 'saving' } | { status: 'saved' } | { status: 'error'; message: string };

/** Save the report to Notes and print it as a PDF. */
export function ReportActions({ report, printRef, exportControl }: ReportActionsProps) {
  const [save, setSave] = useState<SaveState>({ status: 'idle' });
  const note = report.note;

  const saveToNotes = async () => {
    if (!note || save.status === 'saving' || save.status === 'saved') return;
    setSave({ status: 'saving' });
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: note.title,
          body: noteBody(report.content, report.model, report.generatedAt),
          symbol: note.symbol,
          tickers: note.tickers,
          source: 'research',
        }),
      });
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setSave(res.ok ? { status: 'saved' } : { status: 'error', message: data?.error ?? 'Could not save the note.' });
    } catch {
      setSave({ status: 'error', message: 'Could not save the note. Check your connection and try again.' });
    }
  };

  const exportPdf = () => {
    if (printRef.current) printElement(printRef.current, note?.title ?? 'Research brief');
  };

  return (
    <div className={styles.row} data-print-hide>
      <button type="button" className={styles.button} onClick={saveToNotes} disabled={!note || save.status === 'saving' || save.status === 'saved'}>
        {save.status === 'saving' ? 'Saving…' : save.status === 'saved' ? 'Saved to Notes' : 'Save to Notes'}
      </button>
      {exportControl ?? (
        <button type="button" className={styles.button} onClick={exportPdf}>
          Export PDF
        </button>
      )}
      <span className={styles.status} role="status" aria-live="polite">
        {save.status === 'saved' && (
          <>
            Saved. <Link href="/notes">View in Notes →</Link>
          </>
        )}
        {save.status === 'error' && <span className={styles.error}>{save.message}</span>}
      </span>
    </div>
  );
}

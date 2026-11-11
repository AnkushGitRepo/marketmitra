'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DELETE_PHRASE, isPhraseConfirmed } from '@/lib/settings/confirm';
import styles from './TypedConfirmDialog.module.css';

interface TypedConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly children: ReactNode;
  readonly confirmLabel: string;
  readonly busy?: boolean;
  readonly phrase?: string;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** A modal for an irreversible action: the confirm button stays disabled until the user types the phrase. */
export function TypedConfirmDialog({ open, title, children, confirmLabel, busy = false, phrase = DELETE_PHRASE, onConfirm, onCancel }: TypedConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="typed-confirm-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) onCancel();
      }}
    >
      {/* Mounted only while open, so the typed text starts empty every time. */}
      {open && (
        <Body title={title} confirmLabel={confirmLabel} busy={busy} phrase={phrase} onConfirm={onConfirm} onCancel={onCancel}>
          {children}
        </Body>
      )}
    </dialog>
  );
}

function Body({ title, children, confirmLabel, busy, phrase, onConfirm, onCancel }: Omit<TypedConfirmDialogProps, 'open'> & { busy: boolean; phrase: string }) {
  const [typed, setTyped] = useState('');
  const ok = isPhraseConfirmed(typed, phrase);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (ok && !busy) onConfirm();
      }}
    >
      <h2 id="typed-confirm-title" className={styles.title}>
        {title}
      </h2>
      <div className={styles.message}>{children}</div>
      <label className={styles.label}>
        <span>
          Type <strong>{phrase}</strong> to confirm
        </span>
        <input className={styles.input} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus aria-label={`Type ${phrase} to confirm`} />
      </label>
      <div className={styles.actions}>
        <button type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button type="submit" className={styles.danger} disabled={!ok || busy}>
          {busy ? 'Deleting…' : confirmLabel}
        </button>
      </div>
    </form>
  );
}

'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import styles from './AlertSettingsDrawer.module.css';

/** A slide-over (a full-height sheet on phones) for alert settings. Native <dialog>: focus is trapped and Esc closes it. */
export function AlertSettingsDrawer({ open, onClose, children }: { readonly open: boolean; readonly onClose: () => void; readonly children: ReactNode }) {
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
      className={styles.drawer}
      aria-labelledby="alert-settings-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (e.target === ref.current) onClose();
      }}
    >
      <header className={styles.head}>
        <h2 id="alert-settings-title" className={styles.title}>
          Alert settings
        </h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close alert settings">
          <span aria-hidden="true">✕</span>
        </button>
      </header>
      <div className={styles.body}>{children}</div>
    </dialog>
  );
}

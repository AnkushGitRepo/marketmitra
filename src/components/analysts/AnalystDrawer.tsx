'use client';

import { useEffect, useRef } from 'react';
import { DossierReader } from './DossierReader';
import styles from './AnalystDrawer.module.css';

interface AnalystDrawerProps {
  /** The symbol being read, or null when the drawer is closed. */
  readonly symbol: string | null;
  readonly onClose: () => void;
}

/** A right-hand, full-height slide-over for one analyst's dossier. A native modal <dialog>, so focus is trapped and Escape closes it. */
export function AnalystDrawer({ symbol, onClose }: AnalystDrawerProps) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (symbol && !d.open) d.showModal();
    if (!symbol && d.open) d.close();
  }, [symbol]);

  return (
    <dialog
      ref={dialog}
      className={styles.drawer}
      aria-label="Analyst dossier"
      onClose={onClose}
      onClick={(e) => {
        // A click on the backdrop lands on the <dialog> element itself.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {symbol && (
        <div className={styles.inner}>
          <div className={styles.head}>
            <h2 className={styles.title}>{symbol} · living dossier</h2>
            <button type="button" className={styles.close} onClick={onClose} aria-label="Close dossier">
              Close
            </button>
          </div>
          <div className={styles.body}>
            <DossierReader symbol={symbol} tabbed />
          </div>
        </div>
      )}
    </dialog>
  );
}

'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import styles from './InfoPopover.module.css';

/** An (i) button that opens a small panel of explanatory text. Closes on Escape or an outside click. */
export function InfoPopover({ label = 'About this page', children }: { readonly label?: string; readonly children: ReactNode }) {
  const [open, setOpen] = useState(false);
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

  return (
    <div className={styles.wrap} ref={ref}>
      <button type="button" className={styles.button} aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">i</span>
      </button>
      {open && (
        <div id={id} role="note" className={styles.panel}>
          {children}
        </div>
      )}
    </div>
  );
}

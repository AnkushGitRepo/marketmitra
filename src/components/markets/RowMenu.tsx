'use client';

import { useEffect, useRef, useState } from 'react';
import styles from './RowMenu.module.css';

interface RowMenuProps {
  readonly label: string;
  readonly actionLabel: string;
  readonly onAction: () => void;
}

/** A three-dot menu holding one destructive action. Revealed on row hover on desktop, always visible on touch. */
export function RowMenu({ label, actionLabel, onAction }: RowMenuProps) {
  const [open, setOpen] = useState(false);
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
      <button
        type="button"
        className={`${styles.trigger} ${open ? styles.triggerOpen : ''}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => {
              setOpen(false);
              onAction();
            }}
          >
            {actionLabel}
          </button>
        </div>
      )}
    </div>
  );
}

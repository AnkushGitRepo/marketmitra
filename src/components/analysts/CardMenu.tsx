'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { MenuAction } from '@/lib/analysts/desk';
import styles from './CardMenu.module.css';

interface CardMenuProps {
  readonly label: string;
  readonly items: readonly MenuAction[];
  readonly disabled?: boolean;
  readonly onSelect: (id: MenuAction['id']) => void;
}

/** The ⋯ overflow menu on an analyst card. Closes on Escape (returning focus to the button), on a click outside, and after a choice. */
export function CardMenu({ label, items, disabled = false, onSelect }: CardMenuProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (items.length === 0) return null;
  return (
    <div className={styles.root} ref={root}>
      <button ref={button} type="button" className={styles.button} aria-label={label} aria-haspopup="menu" aria-expanded={open} aria-controls={id} disabled={disabled} onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div id={id} role="menu" aria-label={label} className={styles.menu}>
          {items.map((m) => (
            <button
              key={m.id}
              type="button"
              role="menuitem"
              className={`${styles.item} ${m.danger ? styles.danger : ''}`}
              onClick={() => {
                setOpen(false);
                onSelect(m.id);
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

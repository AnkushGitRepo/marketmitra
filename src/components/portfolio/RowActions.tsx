'use client';

import { useEffect, useId, useRef, useState } from 'react';
import styles from './RowActions.module.css';

interface RowActionsProps {
  /** Names the row for screen readers ("Actions for TCS"). */
  readonly label: string;
  readonly busy?: boolean;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
}

const MENU_WIDTH = 168;

/** One "⋯" button per holdings row that opens Edit position / Remove holding, instead of two text links in a narrow column. */
export function RowActions({ label, busy = false, onEdit, onRemove }: RowActionsProps) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const open = pos !== null;

  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      close();
      buttonRef.current?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    // The menu is fixed to the viewport (the table scrolls and would clip it), so it must not drift when the page moves.
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  const toggle = () => {
    if (open) return setPos(null);
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setPos({ top: rect.bottom + 6, left: Math.max(8, rect.right - MENU_WIDTH) });
  };

  const pick = (action: () => void) => {
    setPos(null);
    action();
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.trigger}
        aria-label={`Actions for ${label}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={busy}
        onClick={toggle}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <circle cx="3" cy="8" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="13" cy="8" r="1.4" />
        </svg>
      </button>
      {open ? (
        <div id={menuId} role="menu" className={styles.menu} style={{ top: pos.top, left: pos.left, width: MENU_WIDTH }}>
          <button type="button" role="menuitem" className={styles.item} onClick={() => pick(onEdit)}>Edit position</button>
          <button type="button" role="menuitem" className={`${styles.item} ${styles.danger}`} onClick={() => pick(onRemove)}>Remove holding</button>
        </div>
      ) : null}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { SETTINGS_ITEM, WORKFLOW_ITEMS, type AccountMenuItem } from './accountMenuItems';
import styles from './AccountMenu.module.css';

/** The self-host profile pill. It opens a small menu of the portfolio's workflow pages and Settings. */
export function AccountMenu() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const item = (i: AccountMenuItem) => (
    <Link key={i.href} href={i.href} role="menuitem" className={styles.item} onClick={() => setOpen(false)}>
      <span className={styles.itemLabel}>{i.label}</span>
      <span className={styles.itemHint}>{i.hint}</span>
    </Link>
  );

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={styles.pill}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.avatar} aria-hidden="true">LU</span>
        <span className={styles.name}>Local user</span>
        <svg className={`${styles.caret} ${open ? styles.caretOpen : ''}`} width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      {open ? (
        <div id={menuId} role="menu" aria-label="Account" className={styles.menu}>
          {WORKFLOW_ITEMS.map(item)}
          <div className={styles.divider} role="separator" />
          {item(SETTINGS_ITEM)}
        </div>
      ) : null}
    </div>
  );
}

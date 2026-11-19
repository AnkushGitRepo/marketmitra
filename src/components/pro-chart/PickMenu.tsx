'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ChartTip } from './ChartTip';
import { useMenuPlacement } from './useMenuPlacement';
import styles from './ProChart.module.css';

export interface PickOption<T extends string> {
  value: T;
  label: string;
  /** One line under the label. */
  hint?: string;
}

interface PickMenuProps<T extends string> {
  /** Accessible name, and the tip's title. */
  label: string;
  tip: string;
  value: T;
  options: readonly PickOption<T>[];
  onChange: (value: T) => void;
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="m2.5 7.5 3 3 6-6.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** A one-of-several picker in the chart toolbar, drawn like the other toolbar menus instead of the browser's native list (#268). */
export function PickMenu<T extends string>({
  label,
  tip,
  value,
  options,
  onChange,
}: PickMenuProps<T>) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  useMenuPlacement(open, rootRef);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Opening puts focus on the current choice, so the arrow keys start from it.
  useEffect(() => {
    if (!open) return;
    rootRef.current
      ?.querySelector<HTMLElement>('[role="menuitemradio"][aria-checked="true"]')
      ?.focus();
  }, [open]);

  const current = options.find((o) => o.value === value) ?? options[0];

  const onMenuKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const items = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]')];
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = (at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
    items[next]?.focus();
  };

  return (
    <div ref={rootRef} className={styles.menuWrap}>
      <button
        ref={triggerRef}
        type="button"
        className={`${styles.pickBtn} ${open ? styles.topBtnActive : ''}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {current.label}
        <span aria-hidden="true">▾</span>
        <ChartTip label={label} hint={tip} />
      </button>
      {open && (
        <div
          className={`${styles.menu} ${styles.pickMenu}`}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKey}
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="menuitemradio"
              aria-checked={o.value === value}
              className={`${styles.pickRow} ${o.value === value ? styles.pickRowOn : ''}`}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              <span className={styles.pickCheck}>{o.value === value && <CheckIcon />}</span>
              <span className={styles.pickText}>
                <span className={styles.pickLabel}>{o.label}</span>
                {o.hint && <span className={styles.menuHint}>{o.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

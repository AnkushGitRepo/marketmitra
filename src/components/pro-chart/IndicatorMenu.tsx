'use client';

import { useEffect, useRef, useState } from 'react';
import { INDICATORS, type IndicatorId } from './constants';
import styles from './ProChart.module.css';

interface IndicatorMenuProps {
  active: IndicatorId[];
  onToggle: (id: IndicatorId) => void;
}

export function IndicatorMenu({ active, onToggle }: IndicatorMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const groups = ['Overlays', 'Panes'] as const;

  return (
    <div ref={rootRef} className={styles.menuWrap}>
      <button
        type="button"
        className={`${styles.topBtn} ${open ? styles.topBtnActive : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="18" height="18" viewBox="0 0 22 22" fill="none" aria-hidden="true">
          <path d="M3 17 8 11l4 3 7-9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Indicators{active.length > 0 && <span className={styles.badge}>{active.length}</span>}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {groups.map((g) => (
            <div key={g}>
              <p className={styles.menuGroup}>{g === 'Panes' ? 'Separate panes' : 'On the price chart'}</p>
              {INDICATORS.filter((i) => i.group === g).map((i) => (
                <label key={i.id} className={styles.menuItem}>
                  <input type="checkbox" checked={active.includes(i.id)} onChange={() => onToggle(i.id)} />
                  <span className={styles.menuLabel}>{i.label}</span>
                  <span className={styles.menuHint}>{i.hint}</span>
                </label>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

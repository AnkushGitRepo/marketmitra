'use client';

import { useEffect, useRef, useState } from 'react';
import { describeDrawing, type Drawing } from '@/lib/chart/drawings';
import styles from './ProChart.module.css';

interface DrawingsMenuProps {
  drawings: Drawing[];
  onRemove: (id: string) => void;
  onClear: () => void;
}

/** Everything drawn on this chart, one row each with its own remove button (the toolbar's trash removes all of them). */
export function DrawingsMenu({ drawings, onRemove, onClear }: DrawingsMenuProps) {
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

  return (
    <div ref={rootRef} className={styles.menuWrap}>
      <button
        type="button"
        className={`${styles.topBtn} ${open ? styles.topBtnActive : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Drawings{drawings.length > 0 && <span className={styles.badge}>{drawings.length}</span>}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {drawings.length === 0 ? (
            <p className={styles.menuGroup}>Nothing drawn yet. Pick a tool on the left.</p>
          ) : (
            <>
              {drawings.map((d) => {
                const { name, detail } = describeDrawing(d);
                return (
                  <div key={d.id} className={styles.drawingRow}>
                    <span className={styles.menuLabel}>{name}</span>
                    <span className={styles.menuHint}>{detail}</span>
                    <button
                      type="button"
                      className={styles.drawingRemove}
                      aria-label={`Remove ${name}`}
                      onClick={() => onRemove(d.id)}
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              <button type="button" className={styles.drawingClear} onClick={onClear}>
                Remove all
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

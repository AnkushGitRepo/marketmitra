'use client';

import { useEffect, useRef, useState } from 'react';
import { describeDrawing, type Drawing } from '@/lib/chart/drawings';
import type { OverlayItem } from '@/lib/chart/overlayItems';
import styles from './ProChart.module.css';

interface DrawingsMenuProps {
  drawings: Drawing[];
  onRemove: (id: string) => void;
  onClear: () => void;
  /** What AI Auto-Chart drew, as items of their own; empty when it is off. */
  aiItems?: OverlayItem[];
  onRemoveAi?: (id: string) => void;
  /** Remove everything Auto-Chart drew (the same as turning it off). */
  onClearAi?: () => void;
}

/** Everything drawn on this chart, one row each with its own remove button (the toolbar's trash removes all of them). */
export function DrawingsMenu({
  drawings,
  onRemove,
  onClear,
  aiItems = [],
  onRemoveAi,
  onClearAi,
}: DrawingsMenuProps) {
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
        Drawings
        {drawings.length + aiItems.length > 0 && (
          <span className={styles.badge}>{drawings.length + aiItems.length}</span>
        )}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {drawings.length === 0 && aiItems.length === 0 && (
            <p className={styles.menuGroup}>Nothing drawn yet. Pick a tool on the left.</p>
          )}
          {drawings.length > 0 && (
            <>
              <p className={styles.menuGroup}>Your drawings</p>
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
          {aiItems.length > 0 && (
            <>
              <p className={styles.menuGroup}>✨ AI Auto-Chart</p>
              {aiItems.map((item) => (
                <div key={item.id} className={styles.drawingRow}>
                  <span className={styles.menuLabel}>{item.name}</span>
                  <span className={styles.menuHint}>{item.detail}</span>
                  <button
                    type="button"
                    className={styles.drawingRemove}
                    aria-label={`Remove AI ${item.name}`}
                    onClick={() => onRemoveAi?.(item.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
              <button type="button" className={styles.drawingClear} onClick={onClearAi}>
                Remove all AI drawings
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

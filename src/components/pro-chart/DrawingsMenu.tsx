'use client';

import { useEffect, useRef, useState } from 'react';
import { describeDrawing, type Drawing } from '@/lib/chart/drawings';
import type { OverlayItem } from '@/lib/chart/overlayItems';
import styles from './ProChart.module.css';

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <circle cx="10" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.5" />
      {off && <path d="m3 3 14 14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />}
    </svg>
  );
}

interface DrawingsMenuProps {
  drawings: Drawing[];
  onRemove: (id: string) => void;
  onClear: () => void;
  /** Hide a drawing without removing it, or show it again. */
  onToggleHide?: (id: string) => void;
  /** What AI Auto-Chart drew, as items of their own; empty when it is off. */
  aiItems?: OverlayItem[];
  /** Ids of AI items currently hidden. */
  hiddenAi?: ReadonlySet<string>;
  onToggleHideAi?: (id: string) => void;
  onRemoveAi?: (id: string) => void;
  /** Remove everything Auto-Chart drew (the same as turning it off). */
  onClearAi?: () => void;
}

/** Everything drawn on this chart, one row each with its own remove button (the toolbar's trash removes all of them). */
export function DrawingsMenu({
  drawings,
  onRemove,
  onClear,
  onToggleHide,
  hiddenAi,
  onToggleHideAi,
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
                  <div
                    key={d.id}
                    className={`${styles.drawingRow} ${d.hidden ? styles.drawingHidden : ''}`}
                  >
                    <span className={styles.menuLabel}>{name}</span>
                    <span className={styles.menuHint}>{detail}</span>
                    <span className={styles.drawingActions}>
                      <button
                        type="button"
                        className={styles.drawingRemove}
                        aria-label={`${d.hidden ? 'Show' : 'Hide'} ${name}`}
                        aria-pressed={Boolean(d.hidden)}
                        title={d.hidden ? 'Show' : 'Hide'}
                        onClick={() => onToggleHide?.(d.id)}
                      >
                        <EyeIcon off={Boolean(d.hidden)} />
                      </button>
                      <button
                        type="button"
                        className={styles.drawingRemove}
                        aria-label={`Remove ${name}`}
                        title="Remove"
                        onClick={() => onRemove(d.id)}
                      >
                        ×
                      </button>
                    </span>
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
              {aiItems.map((item) => {
                const hidden = hiddenAi?.has(item.id) ?? false;
                return (
                  <div
                    key={item.id}
                    className={`${styles.drawingRow} ${hidden ? styles.drawingHidden : ''}`}
                  >
                    <span className={styles.menuLabel}>{item.name}</span>
                    <span className={styles.menuHint}>{item.detail}</span>
                    <span className={styles.drawingActions}>
                      <button
                        type="button"
                        className={styles.drawingRemove}
                        aria-label={`${hidden ? 'Show' : 'Hide'} AI ${item.name}`}
                        aria-pressed={hidden}
                        title={hidden ? 'Show' : 'Hide'}
                        onClick={() => onToggleHideAi?.(item.id)}
                      >
                        <EyeIcon off={hidden} />
                      </button>
                      <button
                        type="button"
                        className={styles.drawingRemove}
                        aria-label={`Remove AI ${item.name}`}
                        title="Remove"
                        onClick={() => onRemoveAi?.(item.id)}
                      >
                        ×
                      </button>
                    </span>
                  </div>
                );
              })}
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

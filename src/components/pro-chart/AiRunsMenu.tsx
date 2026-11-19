'use client';

import { useEffect, useRef, useState } from 'react';
import { BOX_LENGTHS, describeRun, type BoxBars, type OverlayRun } from '@/lib/chart/overlayRuns';
import styles from './ProChart.module.css';

interface AiRunsMenuProps {
  runs: OverlayRun[];
  activeId: string | null;
  generating: boolean;
  onShow: (id: string) => void;
  onDelete: (id: string) => void;
  onGenerate: () => void;
  boxBars: BoxBars;
  onBoxBars: (value: BoxBars) => void;
  compareAll: boolean;
  onCompareAll: (value: boolean) => void;
}

/** The Auto-Charts saved for this stock and timeframe: show one, delete one, or generate a new one next to them (#253). */
export function AiRunsMenu({
  runs,
  activeId,
  generating,
  onShow,
  onDelete,
  onGenerate,
  boxBars,
  onBoxBars,
  compareAll,
  onCompareAll,
}: AiRunsMenuProps) {
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

  const now = new Date();
  return (
    <div ref={rootRef} className={styles.menuWrap}>
      <button
        type="button"
        className={`${styles.topBtn} ${open ? styles.topBtnActive : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        title="Saved Auto-Charts: show, compare or delete earlier ones"
        onClick={() => setOpen((o) => !o)}
      >
        <span className={styles.btnIcon} aria-hidden="true">
          ★
        </span>
        <span className={styles.btnText}>Saved</span>
        {runs.length > 0 && <span className={styles.badge}>{runs.length}</span>}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <p className={styles.menuGroup}>✨ Saved Auto-Charts</p>
          {runs.length === 0 && (
            <p className={styles.runsEmpty}>
              None yet. Turn on AI Auto-Chart to make the first one.
            </p>
          )}
          {runs.map((r) => {
            const d = describeRun(r, now);
            const active = r.id === activeId;
            return (
              <div key={r.id} className={`${styles.drawingRow} ${active ? styles.runActive : ''}`}>
                <button
                  type="button"
                  className={styles.runShow}
                  onClick={() => onShow(r.id)}
                  aria-pressed={active}
                >
                  <span className={styles.menuLabel}>
                    {d.when}
                    {active && <span className={styles.runBadge}>Showing</span>}
                  </span>
                  <span className={styles.menuHint}>
                    {d.price} then · {d.summary}
                  </span>
                </button>
                <span className={styles.drawingActions}>
                  <button
                    type="button"
                    className={styles.drawingRemove}
                    aria-label={`Delete the Auto-Chart from ${d.when}`}
                    title="Delete"
                    onClick={() => onDelete(r.id)}
                  >
                    ×
                  </button>
                </span>
              </div>
            );
          })}
          <div className={styles.runOptions}>
            <label className={styles.runOption}>
              <span>Show every saved trade setup</span>
              <input
                type="checkbox"
                checked={compareAll}
                onChange={(e) => onCompareAll(e.target.checked)}
              />
            </label>
            <label className={styles.runOption}>
              <span>Longest trade box</span>
              <select
                className={styles.runSelect}
                value={boxBars === null ? 'all' : String(boxBars)}
                onChange={(e) =>
                  onBoxBars(e.target.value === 'all' ? null : Number(e.target.value))
                }
              >
                {BOX_LENGTHS.map((n) => (
                  <option key={n ?? 'all'} value={n === null ? 'all' : String(n)}>
                    {n === null ? 'To now' : `${n} candles`}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            className={styles.runGenerate}
            disabled={generating}
            onClick={onGenerate}
          >
            {generating ? 'Drawing…' : '✨ Generate new (keeps these)'}
          </button>
        </div>
      )}
    </div>
  );
}

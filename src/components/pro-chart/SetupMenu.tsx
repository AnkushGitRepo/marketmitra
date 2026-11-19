'use client';

import { useEffect, useRef, useState } from 'react';
import {
  BUILT_IN_SETUPS,
  MAX_CUSTOM_SETUPS,
  matchingSetupId,
  type IndicatorSetup,
} from '@/lib/chart/indicatorSetups';
import type { StoredParams } from '@/lib/chart/indicatorParams';
import type { IndicatorId } from './constants';
import styles from './ProChart.module.css';

interface SetupMenuProps {
  active: IndicatorId[];
  params: StoredParams;
  custom: IndicatorSetup[];
  onApply: (setup: IndicatorSetup) => void;
  onSave: (name: string) => void;
  onDelete: (id: string) => void;
}

/** Ready-made indicator sets for different kinds of user, and the user's own: one click puts a whole chart layout on (#259). */
export function SetupMenu({ active, params, custom, onApply, onSave, onDelete }: SetupMenuProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
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

  const current = matchingSetupId([...BUILT_IN_SETUPS, ...custom], active, params);
  const canSave = name.trim().length > 0 && active.length > 0;
  const save = () => {
    if (!canSave) return;
    onSave(name);
    setName('');
  };

  const row = (s: IndicatorSetup, hint: string, removable: boolean) => {
    const on = s.id === current;
    return (
      <div key={s.id} className={`${styles.drawingRow} ${on ? styles.runActive : ''}`}>
        <button
          type="button"
          className={styles.runShow}
          aria-pressed={on}
          onClick={() => {
            onApply(s);
            setOpen(false);
          }}
        >
          <span className={styles.menuLabel}>
            {s.name}
            {on && <span className={styles.runBadge}>On</span>}
          </span>
          <span className={styles.menuHint}>{hint}</span>
        </button>
        {removable && (
          <span className={styles.drawingActions}>
            <button
              type="button"
              className={styles.drawingRemove}
              aria-label={`Delete the setup ${s.name}`}
              title="Delete"
              onClick={() => onDelete(s.id)}
            >
              ×
            </button>
          </span>
        )}
      </div>
    );
  };

  return (
    <div ref={rootRef} className={styles.menuWrap}>
      <button
        type="button"
        className={`${styles.topBtn} ${open ? styles.topBtnActive : ''}`}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Setups
        {custom.length > 0 && <span className={styles.badge}>{custom.length}</span>}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          <div className={`${styles.runOptions} ${styles.runOptionsTop}`}>
            <label className={styles.runOption}>
              <span>Save what is on the chart now</span>
            </label>
            <div className={styles.runOption}>
              <input
                className={styles.setupInput}
                type="text"
                maxLength={30}
                value={name}
                placeholder="Name, e.g. My breakout"
                aria-label="Setup name"
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && save()}
              />
              <button
                type="button"
                className={styles.setupSave}
                disabled={!canSave || custom.length >= MAX_CUSTOM_SETUPS}
                onClick={save}
              >
                Save
              </button>
            </div>
          </div>
          <p className={styles.menuGroup}>Ready-made</p>
          {BUILT_IN_SETUPS.map((s) => row(s, s.hint, false))}
          <p className={styles.menuGroup}>Your setups</p>
          {custom.length === 0 && (
            <p className={styles.runsEmpty}>
              None yet. Choose your indicators, then save them below.
            </p>
          )}
          {custom.map((s) => row(s, `${s.indicators.length} indicators`, true))}
        </div>
      )}
    </div>
  );
}

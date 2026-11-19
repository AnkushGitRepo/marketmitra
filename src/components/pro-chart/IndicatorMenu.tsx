'use client';

import { useEffect, useRef, useState } from 'react';
import {
  PARAM_SPECS,
  resolveParams,
  type IndicatorParams,
  type ParamSpec,
  type StoredParams,
} from '@/lib/chart/indicatorParams';
import { INDICATORS, type IndicatorId } from './constants';
import styles from './ProChart.module.css';

interface IndicatorMenuProps {
  active: IndicatorId[];
  params: StoredParams;
  onToggle: (id: IndicatorId) => void;
  /** Save this indicator's settings, or `null` to go back to the defaults. */
  onParams: (id: IndicatorId, next: Partial<IndicatorParams> | null) => void;
}

interface ParamFieldProps {
  spec: ParamSpec;
  value: number;
  onValue: (n: number) => void;
}

/** A number box that lets the user clear it and retype; a valid number is applied at once, and the box snaps back to the saved value on blur. */
function ParamField({ spec, value, onValue }: ParamFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <label className={styles.paramField}>
      <span>{spec.label}</span>
      <input
        type="number"
        inputMode="decimal"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={draft ?? value}
        onChange={(e) => {
          setDraft(e.target.value);
          const n = e.target.valueAsNumber;
          if (Number.isFinite(n)) onValue(n);
        }}
        onBlur={() => setDraft(null)}
      />
    </label>
  );
}

export function IndicatorMenu({ active, params, onToggle, onParams }: IndicatorMenuProps) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<IndicatorId | null>(null);
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
          <path
            d="M3 17 8 11l4 3 7-9"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Indicators{active.length > 0 && <span className={styles.badge}>{active.length}</span>}
        <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className={styles.menu} role="menu">
          {groups.map((g) => (
            <div key={g}>
              <p className={styles.menuGroup}>
                {g === 'Panes' ? 'Separate panes' : 'On the price chart'}
              </p>
              {INDICATORS.filter((i) => i.group === g).map((i) => {
                const specs = PARAM_SPECS[i.id];
                const current = resolveParams(i.id, params[i.id]);
                return (
                  <div key={i.id}>
                    <div className={styles.menuRow}>
                      <label className={styles.menuItem}>
                        <input
                          type="checkbox"
                          checked={active.includes(i.id)}
                          onChange={() => onToggle(i.id)}
                        />
                        <span className={styles.menuLabel}>
                          <i
                            className={styles.swatch}
                            style={{ background: i.color }}
                            aria-hidden="true"
                          />
                          {i.label}
                        </span>
                        <span className={styles.menuHint}>{i.hint}</span>
                      </label>
                      {specs && (
                        <button
                          type="button"
                          className={`${styles.gearBtn} ${editing === i.id ? styles.topBtnActive : ''}`}
                          aria-label={`${i.label} settings`}
                          aria-expanded={editing === i.id}
                          title="Settings"
                          onClick={() => setEditing((cur) => (cur === i.id ? null : i.id))}
                        >
                          ⚙
                        </button>
                      )}
                    </div>
                    {specs && editing === i.id && (
                      <div className={styles.paramEditor}>
                        {specs.map((spec) => (
                          <ParamField
                            key={spec.key}
                            spec={spec}
                            value={current[spec.key]}
                            onValue={(n) => onParams(i.id, { ...current, [spec.key]: n })}
                          />
                        ))}
                        <button
                          type="button"
                          className={styles.paramReset}
                          onClick={() => onParams(i.id, null)}
                        >
                          Reset
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

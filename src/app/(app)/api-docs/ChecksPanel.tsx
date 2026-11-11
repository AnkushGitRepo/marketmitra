'use client';

import type { Check } from '@/lib/api-docs/checks';
import styles from './page.module.css';

type Kind = Check['kind'];

const KIND_LABEL: Record<Kind, string> = {
  status: 'HTTP status',
  header: 'Header',
  jsonPath: 'JSON path',
  latency: 'Latency (ms)',
};

function blankCheck(kind: Kind): Check {
  switch (kind) {
    case 'status':
      return { kind, equals: 200 };
    case 'header':
      return { kind, name: 'content-type', contains: 'json' };
    case 'latency':
      return { kind, maxMs: 500 };
    case 'jsonPath':
      return { kind, path: '', mode: 'exists' };
  }
}

interface ChecksEditorProps {
  checks: Check[];
  onChange: (next: Check[]) => void;
}

/** Collapsed by default: a reader who only wants to see the output is never forced through setup. */
export function ChecksEditor({ checks, onChange }: ChecksEditorProps) {
  const update = (i: number, next: Check) => onChange(checks.map((c, idx) => (idx === i ? next : c)));
  const remove = (i: number) => onChange(checks.filter((_, idx) => idx !== i));

  return (
    <details className={styles.checksEditor}>
      <summary className={styles.checksSummary}>
        Checks <span className={styles.fieldHint}>({checks.length}, run automatically on Send)</span>
      </summary>
      {checks.map((c, i) => (
        <div key={i} className={styles.checkRow}>
          <select
            className={styles.checkInput}
            aria-label="Check type"
            value={c.kind}
            onChange={(e) => update(i, blankCheck(e.target.value as Kind))}
          >
            {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
          {c.kind === 'status' && (
            <>
              <span className={styles.checkOp}>equals</span>
              <input
                className={styles.checkInput}
                aria-label="Expected status"
                inputMode="numeric"
                value={String(c.equals)}
                onChange={(e) => update(i, { ...c, equals: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              />
            </>
          )}
          {c.kind === 'latency' && (
            <>
              <span className={styles.checkOp}>under</span>
              <input
                className={styles.checkInput}
                aria-label="Maximum latency in ms"
                inputMode="numeric"
                value={String(c.maxMs)}
                onChange={(e) => update(i, { ...c, maxMs: Number(e.target.value.replace(/\D/g, '')) || 0 })}
              />
            </>
          )}
          {c.kind === 'header' && (
            <>
              <input
                className={styles.checkInput}
                aria-label="Header name"
                value={c.name}
                onChange={(e) => update(i, { ...c, name: e.target.value })}
              />
              <span className={styles.checkOp}>contains</span>
              <input
                className={styles.checkInput}
                aria-label="Header value contains"
                value={c.contains}
                onChange={(e) => update(i, { ...c, contains: e.target.value })}
              />
            </>
          )}
          {c.kind === 'jsonPath' && (
            <>
              <input
                className={styles.checkInput}
                aria-label="JSON path"
                placeholder="data.items[0].symbol"
                value={c.path}
                onChange={(e) => update(i, { ...c, path: e.target.value })}
              />
              <select
                className={styles.checkInput}
                aria-label="Path condition"
                value={c.mode}
                onChange={(e) => update(i, { ...c, mode: e.target.value as 'exists' | 'equals' })}
              >
                <option value="exists">exists</option>
                <option value="equals">equals</option>
              </select>
              {c.mode === 'equals' && (
                <input
                  className={styles.checkInput}
                  aria-label="Expected value"
                  value={c.value ?? ''}
                  onChange={(e) => update(i, { ...c, value: e.target.value })}
                />
              )}
            </>
          )}
          <button type="button" className={styles.checkRemove} onClick={() => remove(i)} aria-label="Remove check">
            &times;
          </button>
        </div>
      ))}
      <button
        type="button"
        className={styles.btnSecondary}
        onClick={() => onChange([...checks, blankCheck('jsonPath')])}
      >
        + Add check
      </button>
    </details>
  );
}

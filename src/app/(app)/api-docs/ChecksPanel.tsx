'use client';

import type { Check, CheckReport } from '@/lib/api-docs/checks';
import styles from './page.module.css';

type Kind = Check['kind'];

const KIND_LABEL: Record<Kind, string> = {
  status: 'Status equals',
  header: 'Header contains',
  jsonPath: 'JSON path',
};

function blankCheck(kind: Kind): Check {
  if (kind === 'status') return { kind, equals: 200 };
  if (kind === 'header') return { kind, name: 'content-type', contains: 'json' };
  return { kind, path: '', mode: 'exists' };
}

interface ChecksPanelProps {
  checks: Check[];
  onChange: (next: Check[]) => void;
  /** Null until a request has been sent. */
  report: CheckReport | null;
}

export function ChecksPanel({ checks, onChange, report }: ChecksPanelProps) {
  const update = (i: number, next: Check) => onChange(checks.map((c, idx) => (idx === i ? next : c)));
  const remove = (i: number) => onChange(checks.filter((_, idx) => idx !== i));

  return (
    <div className={styles.fieldGroup}>
      <p className={styles.fieldGroupTitle}>
        Checks <span className={styles.fieldHint}>(pass/fail after Send)</span>
      </p>
      {checks.map((c, i) => (
        <div key={i} className={styles.checkRow}>
          <select
            className={styles.input}
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
            <input
              className={styles.input}
              aria-label="Expected status"
              inputMode="numeric"
              value={String(c.equals)}
              onChange={(e) => update(i, { ...c, equals: Number(e.target.value.replace(/\D/g, '')) || 0 })}
            />
          )}
          {c.kind === 'header' && (
            <>
              <input
                className={styles.input}
                aria-label="Header name"
                value={c.name}
                onChange={(e) => update(i, { ...c, name: e.target.value })}
              />
              <input
                className={styles.input}
                aria-label="Header value contains"
                value={c.contains}
                onChange={(e) => update(i, { ...c, contains: e.target.value })}
              />
            </>
          )}
          {c.kind === 'jsonPath' && (
            <>
              <input
                className={styles.input}
                aria-label="JSON path"
                placeholder="data.items[0].symbol"
                value={c.path}
                onChange={(e) => update(i, { ...c, path: e.target.value })}
              />
              <select
                className={styles.input}
                aria-label="Path condition"
                value={c.mode}
                onChange={(e) => update(i, { ...c, mode: e.target.value as 'exists' | 'equals' })}
              >
                <option value="exists">exists</option>
                <option value="equals">equals</option>
              </select>
              {c.mode === 'equals' && (
                <input
                  className={styles.input}
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

      {report && (
        <div className={styles.checkReport} role="status">
          <span className={`${styles.status} ${report.passed ? styles.statusOk : styles.statusBad}`}>
            {report.passed ? 'All checks passed' : 'Checks failed'}
          </span>
          <ul className={styles.checkList}>
            {report.results.map((r, i) => (
              <li key={i} className={r.passed ? styles.checkPass : styles.checkFail}>
                <span aria-hidden="true">{r.passed ? '✓' : '✗'}</span> {r.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

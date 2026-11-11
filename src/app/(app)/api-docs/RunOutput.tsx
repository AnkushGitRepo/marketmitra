'use client';

import { useState, type KeyboardEvent } from 'react';
import type { CheckReport } from '@/lib/api-docs/checks';
import styles from './page.module.css';

export interface RunMeta {
  status: number;
  ok: boolean;
  ms: number;
  /** Extra note, e.g. rate-limit headroom. */
  note?: string;
}

interface RunOutputProps {
  meta: RunMeta;
  report: CheckReport | null;
  /** Pretty-printed body and the untouched response text. */
  formatted: string;
  raw: string;
}

/** Cmd/Ctrl+Enter runs the request. */
export function runShortcut(e: KeyboardEvent<HTMLElement>, run: () => void, busy: boolean): void {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && !busy) {
    e.preventDefault();
    run();
  }
}

function formatBytes(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

export function RunOutput({ meta, report, formatted, raw }: RunOutputProps) {
  const [view, setView] = useState<'formatted' | 'raw'>('formatted');
  const [copied, setCopied] = useState(false);
  const text = view === 'formatted' ? formatted : raw;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={styles.runOutput}>
      <div className={styles.runStrip} role="status">
        <div className={styles.pills}>
          {report?.results.map((r, i) => (
            <span key={i} className={`${styles.pill} ${r.passed ? styles.pillPass : styles.pillFail}`}>
              {r.passed ? '✓' : '✕'} {r.detail}
            </span>
          ))}
        </div>
        <span className={styles.runMeta}>
          <span className={`${styles.status} ${meta.ok ? styles.statusOk : styles.statusBad}`}>
            {meta.status === 0 ? 'No response' : meta.status}
          </span>{' '}
          {meta.ms} ms &middot; {formatBytes(new Blob([raw]).size)}
          {meta.note ? ` · ${meta.note}` : ''}
        </span>
      </div>

      <div className={styles.viewerHead}>
        <span className={styles.docSectionTitle}>Response</span>
        <span className={styles.viewerTools}>
          <button
            type="button"
            className={`${styles.codeTab} ${view === 'formatted' ? styles.codeTabActive : ''}`}
            onClick={() => setView('formatted')}
          >
            Formatted
          </button>
          <button
            type="button"
            className={`${styles.codeTab} ${view === 'raw' ? styles.codeTabActive : ''}`}
            onClick={() => setView('raw')}
          >
            Raw
          </button>
          <button type="button" className={styles.codeTab} onClick={copy}>
            {copied ? 'Copied' : 'Copy JSON'}
          </button>
        </span>
      </div>
      <pre className={`${styles.pre} ${styles.outputPre}`}>
        <code>{text || '(empty response)'}</code>
      </pre>
    </div>
  );
}

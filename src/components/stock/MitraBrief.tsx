'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { UNRESTRICTED_DISCLAIMER, type PromptMode } from '@/lib/ai/promptMode';
import { chipPrompt, type StockBrief } from '@/lib/ai/stockBrief';
import styles from './MitraBrief.module.css';

export interface BriefData {
  brief: StockBrief;
  mode: PromptMode;
  generatedAt: string;
}

interface MitraBriefProps {
  readonly symbol: string;
  readonly hasKey: boolean;
  /** The mode the server resolved for this user right now (hosted is always guarded). */
  readonly mode: PromptMode;
  readonly initial: BriefData | null;
  /** The longer AI read, kept reachable under the brief. */
  readonly longRead?: ReactNode;
}

const GUARDED_DISCLAIMER = 'This is a synthesis of public data, not investment advice.';

/** Strengths and watchpoints from public data, generated on demand with the user's own AI key. */
export function MitraBrief({ symbol, hasKey, mode, initial, longRead }: MitraBriefProps) {
  const [data, setData] = useState<BriefData | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (force: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/insights/stock-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, force }),
      });
      const json = (await res.json()) as { success: boolean; data?: BriefData; error?: string };
      if (!res.ok || !json.success || !json.data) {
        throw new Error(json.error === 'no_ai_key' ? 'Add your AI key in Settings first.' : (json.error ?? 'Could not generate the brief.'));
      }
      setData(json.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate the brief.');
    } finally {
      setLoading(false);
    }
  };

  const unrestricted = (data?.mode ?? mode) === 'unrestricted';
  const brief = data?.brief;

  return (
    <section className={styles.card} aria-label="Mitra brief">
      <header className={styles.head}>
        <p className={styles.title}>Mitra brief</p>
        {unrestricted && (
          <span className={styles.badge} title="Local only. Mitra may give valuation opinions. Change this in Settings > AI & Models.">
            Unrestricted · local only
          </span>
        )}
      </header>

      {!hasKey ? (
        <p className={styles.muted}>
          Add your AI provider key to generate a brief. <Link href="/settings?tab=ai">Open Settings</Link>
        </p>
      ) : !brief ? (
        <>
          <p className={styles.muted}>Strengths and watchpoints for {symbol}, written from public data. It uses your own AI key, only when you ask.</p>
          <button type="button" className={styles.primary} disabled={loading} onClick={() => void generate(false)}>
            {loading ? 'Writing…' : 'Generate brief'}
          </button>
        </>
      ) : (
        <>
          {brief.strengths.length > 0 && (
            <div>
              <p className={styles.label}>Strengths</p>
              <ul className={styles.list}>
                {brief.strengths.map((s) => (
                  <li key={s} className={styles.strength}>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {brief.watchpoints.length > 0 && (
            <div>
              <p className={styles.label}>Watchpoint</p>
              <ul className={styles.list}>
                {brief.watchpoints.map((w) => (
                  <li key={w} className={styles.watch}>
                    {w}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {(brief.valuation || brief.entry) && (
            <div className={styles.view}>
              {brief.valuation && <span className={styles.pill}>Valuation view: {brief.valuation}</span>}
              {brief.entry && <p className={styles.entry}>{brief.entry}</p>}
            </div>
          )}
          <p className={styles.disclaimer}>{(data?.mode ?? mode) === 'unrestricted' ? UNRESTRICTED_DISCLAIMER : GUARDED_DISCLAIMER}</p>
          <button type="button" className={styles.link} disabled={loading} onClick={() => void generate(true)}>
            {loading ? 'Writing…' : 'Refresh brief'}
          </button>
        </>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      <Link className={styles.chip} href={`/mitra?q=${encodeURIComponent(chipPrompt(symbol, mode))}`}>
        Ask Mitra: {chipPrompt(symbol, mode).replace(/\.$/, '')}
        <span aria-hidden="true"> →</span>
      </Link>

      {hasKey && longRead && (
        <details className={styles.more}>
          <summary>Longer AI read</summary>
          {longRead}
        </details>
      )}
    </section>
  );
}

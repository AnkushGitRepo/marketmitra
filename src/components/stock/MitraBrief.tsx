'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { UNRESTRICTED_DISCLAIMER, type PromptMode } from '@/lib/ai/promptMode';
import { POINT_KEYS, POINT_TITLES, chipPrompts, signalLabel, type StockBrief } from '@/lib/ai/stockBrief';
import type { StockSignals } from '@/lib/stock/signals';
import { SignalMatrix } from './SignalMatrix';
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
  /** Computed data panel: shown without an AI key or any generation. */
  readonly signals: StockSignals;
  /** The longer AI read, kept reachable under the brief. */
  readonly longRead?: ReactNode;
}

const GUARDED_DISCLAIMER = 'This is a synthesis of public data, not investment advice.';
const SKELETON_ROWS = 5;

/** The 360 brief: up to five AI points on the left, the computed numbers they rest on on the right. */
export function MitraBrief({ symbol, hasKey, mode, initial, signals, longRead }: MitraBriefProps) {
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

  const activeMode = data?.mode ?? mode;
  const unrestricted = activeMode === 'unrestricted';
  const brief = data?.brief;
  const [primaryChip, stressChip] = chipPrompts(symbol, mode);
  const c = signals.coverage;

  return (
    <section className={styles.card} aria-label="Mitra brief">
      <header className={styles.head}>
        <div>
          <p className={styles.title}>Mitra 360 brief</p>
          <p className={styles.meta}>
            Built from {c.financialYears > 0 ? `${c.financialYears} years of financials` : 'the available financials'}, {c.quarters} quarters of shareholding and {c.headlines}{' '}
            recent headlines.
          </p>
        </div>
        <div className={styles.headActions}>
          {unrestricted && (
            <span className={styles.badge} title="Local only. Mitra may give valuation opinions. Change this in Settings > AI & Models.">
              Unrestricted · local only
            </span>
          )}
          {brief && (
            <button type="button" className={styles.link} disabled={loading} onClick={() => void generate(true)}>
              {loading ? 'Writing…' : 'Regenerate'}
            </button>
          )}
        </div>
      </header>

      <div className={styles.cols}>
        <div className={styles.points} aria-live="polite">
          {loading && !brief ? (
            <div className={styles.skeleton} aria-label="Writing the brief">
              {Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <div key={i} className={styles.skelRow}>
                  <span className={styles.skelBar} />
                  <span className={styles.skelLine} />
                  <span className={`${styles.skelLine} ${styles.skelShort}`} />
                </div>
              ))}
            </div>
          ) : !hasKey ? (
            <p className={styles.muted}>
              Add your AI provider key to get the written read. The numbers on the right need no key. <Link href="/settings?tab=ai">Open Settings</Link>
            </p>
          ) : !brief ? (
            <div className={styles.empty}>
              <p className={styles.muted}>
                Five points on quality, growth, valuation, smart money and the biggest risk, written from the numbers on the right. It uses your own AI key, only when you ask.
              </p>
              <button type="button" className={styles.primary} disabled={loading} onClick={() => void generate(false)}>
                Generate brief
              </button>
              <ul className={styles.ghostList} aria-label="What the brief covers">
                {POINT_KEYS.map((k) => (
                  <li key={k} className={styles.ghost}>
                    <span>{POINT_TITLES[k]}</span>
                    <span className={styles.ghostNote}>not generated yet</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <>
              <ul className={styles.pointList}>
                {brief.points.map((p) => (
                  <li key={p.key} className={`${styles.point} ${styles[p.signal]}`}>
                    <div className={styles.pointHead}>
                      <span className={styles.pointTitle}>{POINT_TITLES[p.key]}</span>
                      <span className={`${styles.pill} ${styles[`pill_${p.signal}`]}`}>{signalLabel(p.signal, activeMode)}</span>
                    </div>
                    <p className={styles.pointText}>{p.text}</p>
                  </li>
                ))}
              </ul>
              {(brief.valuation || brief.entry) && (
                <div className={styles.view}>
                  {brief.valuation && <span className={styles.viewPill}>Valuation view: {brief.valuation}</span>}
                  {brief.entry && <p className={styles.entry}>{brief.entry}</p>}
                </div>
              )}
              <p className={styles.disclaimer}>{unrestricted ? UNRESTRICTED_DISCLAIMER : GUARDED_DISCLAIMER}</p>
            </>
          )}
          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}
        </div>

        <aside className={styles.matrix} aria-label="Data behind the brief">
          <SignalMatrix signals={signals} />
        </aside>
      </div>

      <div className={styles.chips}>
        <Link className={styles.chip} href={`/mitra?q=${encodeURIComponent(primaryChip)}`}>
          Ask Mitra: {primaryChip.replace(/\.$/, '')}
          <span aria-hidden="true"> →</span>
        </Link>
        <Link className={styles.chip} href={`/mitra?q=${encodeURIComponent(stressChip)}`}>
          Stress-test with Mitra
          <span aria-hidden="true"> →</span>
        </Link>
      </div>

      {hasKey && longRead && (
        <details className={styles.more}>
          <summary>Longer AI read</summary>
          {longRead}
        </details>
      )}
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { UNRESTRICTED_DISCLAIMER, type PromptMode } from '@/lib/ai/promptMode';
import { BRIEF_TABS, pointsForTab, tabCounts, type BriefTab } from '@/lib/ai/briefTabs';
import { POINT_TITLES, chipPrompts, signalLabel, type StockBrief } from '@/lib/ai/stockBrief';
import { generationError } from '@/lib/http/generationError';
import { emphasizeNumbers } from '@/lib/stock/sensitivity';
import type { StockSignals } from '@/lib/stock/signals';
import { SensitivityCard } from './SensitivityCard';
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
}

const GUARDED_DISCLAIMER = 'This is a synthesis of public data, not investment advice.';
const SKELETON_ROWS = 5;

/** Point text with its figures in bold. */
function Emphasized({ text }: { readonly text: string }) {
  return (
    <>
      {emphasizeNumbers(text).map((part, i) => (part.bold ? <strong key={i}>{part.text}</strong> : <span key={i}>{part.text}</span>))}
    </>
  );
}

/** The 360 brief: up to five AI points on the left, the computed numbers they rest on on the right. */
export function MitraBrief({ symbol, hasKey, mode, initial, signals }: MitraBriefProps) {
  const [data, setData] = useState<BriefData | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<BriefTab>('all');

  const generate = async (force: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/insights/stock-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol, force }),
      });
      // A reply that is not JSON (a platform timeout page, a login redirect) must not surface the parser's own error.
      const json = (await res.json().catch(() => null)) as { success?: boolean; data?: BriefData; error?: string } | null;
      if (!res.ok || !json?.success || !json.data) throw new Error(generationError(res.status, json?.error));
      setData(json.data);
    } catch (e) {
      // A thrown network error (TypeError: Load failed / Failed to fetch) is a connection problem, not a message to show raw.
      setError(e instanceof TypeError ? 'The connection dropped while the brief was being written. Try again: a finished brief is kept for 24 hours, so it shows straight away.' : e instanceof Error ? e.message : 'Could not generate the brief.');
    } finally {
      setLoading(false);
    }
  };

  const activeMode = data?.mode ?? mode;
  const unrestricted = activeMode === 'unrestricted';
  const brief = data?.brief;
  const [primaryChip, stressChip] = chipPrompts(symbol, mode);
  const c = signals.coverage;
  const counts = brief ? tabCounts(brief.points) : tabCounts([]);
  const visible = brief ? pointsForTab(brief.points, tab) : [];

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
              <SensitivityCard signals={signals} />
            </div>
          ) : (
            <>
              <div className={styles.tabs} role="tablist" aria-label="Brief sections">
                {BRIEF_TABS.map((t) => (
                  <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={styles.tab} onClick={() => setTab(t.id)}>
                    {t.label} <span className={styles.tabCount}>{counts[t.id]}</span>
                  </button>
                ))}
              </div>
              {visible.length === 0 ? (
                <p className={styles.muted}>{tab === 'supports' ? 'No point reads as a clear strength.' : tab === 'weak' ? 'No point reads as a concern.' : 'No valuation point in this brief.'}</p>
              ) : (
                <ul className={styles.pointList}>
                  {visible.map((p) => (
                    <li key={p.key} className={`${styles.point} ${styles[p.signal]}`}>
                      <div className={styles.pointHead}>
                        <span className={styles.pointTitle}>{POINT_TITLES[p.key]}</span>
                        <span className={`${styles.pill} ${styles[`pill_${p.signal}`]}`}>{signalLabel(p.signal, activeMode)}</span>
                      </div>
                      <p className={styles.pointText}>
                        <Emphasized text={p.text} />
                      </p>
                    </li>
                  ))}
                </ul>
              )}
              {tab === 'valuation' && <SensitivityCard signals={signals} />}
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

    </section>
  );
}

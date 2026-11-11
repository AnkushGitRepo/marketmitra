'use client';

import { useMemo } from 'react';
import { formatInr } from '@/lib/dashboard/format';
import { useMask } from '@/lib/dashboard/MaskContext';
import { portfolioTotals } from '@/lib/portfolio/portfolioMetrics';
import { buildStarterPrompts, FALLBACK_STARTERS, greetingFor, portfolioStatus, type StarterPrompt } from '@/lib/mitra-chat/starters';
import type { ChatContextState } from './useChatContext';
import styles from './EmptyState.module.css';

interface EmptyStateProps {
  readonly state: ChatContextState;
  readonly onPrompt: (card: StarterPrompt) => void;
}

const NO_HOLDINGS_LINE = 'Ask about a company, the market, or attach an annual report, broker screenshot or earnings-call recording.';
const WITH_HOLDINGS_LINE = 'Ask about your holdings, sector risk, or paste an annual report.';

/** The new-chat screen: a greeting, a live portfolio status, and starter prompts built from the user's own holdings. */
export function EmptyState({ state, onPrompt }: EmptyStateProps) {
  const { masked } = useMask();
  const ready = state.status === 'ready' ? state.context : null;

  const cards = useMemo(() => (ready ? buildStarterPrompts(ready.holdings) : [...FALLBACK_STARTERS]), [ready]);
  const status = useMemo(() => {
    if (!ready) return null;
    return portfolioStatus(portfolioTotals(ready.holdings), (n) => formatInr(n, 0, masked));
  }, [ready, masked]);
  // Computed on the client after the context arrives, so the time of day is never a server/client mismatch.
  const greeting = useMemo(() => (ready ? greetingFor(new Date(), ready.firstName) : null), [ready]);
  const loading = state.status === 'loading';

  return (
    <div className={styles.root}>
      <p className={styles.greeting}>{greeting ?? (loading ? ' ' : 'Hello')}</p>
      <h2 className={styles.title}>Mitra Financial Copilot</h2>
      {loading ? (
        <p className={`${styles.status} ${styles.skeleton}`} aria-hidden="true" />
      ) : (
        <p className={styles.status}>{status ? `${status} ${WITH_HOLDINGS_LINE}` : NO_HOLDINGS_LINE}</p>
      )}

      <div className={styles.cards} aria-busy={loading}>
        {loading
          ? [0, 1, 2, 3].map((i) => <span key={i} className={`${styles.card} ${styles.cardSkeleton}`} aria-hidden="true" />)
          : cards.map((card) => (
              <button key={card.id} type="button" className={styles.card} onClick={() => onPrompt(card)}>
                <span className={styles.cardHead}>
                  <span aria-hidden="true">{card.icon}</span>
                  <span>{card.title}</span>
                </span>
                <span className={styles.cardText}>{card.action === 'attach' ? 'Attach a PDF or recording and Mitra will read it with you.' : card.prompt}</span>
              </button>
            ))}
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { briefFromInsight } from '@/lib/dashboard/briefText';
import styles from './AiBriefCard.module.css';

interface AiBriefCardProps {
  /** Latest cached portfolio insight, if one exists. */
  readonly initial: string | null;
  /** Whether an AI key is resolvable (server-checked). */
  readonly hasKey: boolean;
}

/** Two sentences from Mitra on what is driving the portfolio. Reuses the cached portfolio insight; generating is opt-in. */
export function AiBriefCard({ initial, hasKey }: AiBriefCardProps) {
  const [content, setContent] = useState<string | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/insights/portfolio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: false }),
      });
      const payload: unknown = await res.json().catch(() => null);
      const data = (payload as { data?: { content?: unknown } } | null)?.data;
      if (!res.ok || typeof data?.content !== 'string') {
        setError('Could not generate the brief right now. Try again in a moment.');
        return;
      }
      setContent(data.content);
    } catch {
      setError('Could not reach Mitra. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const brief = content ? briefFromInsight(content) : '';

  return (
    <section className={styles.card} aria-label="AI daily brief">
      <div className={styles.head}>
        <h2 className={styles.title}>AI Daily Brief</h2>
        <span className={styles.badge}>Mitra</span>
      </div>
      {brief ? (
        <>
          <p className={styles.body}>{brief}</p>
          <p className={styles.meta}>AI-generated summary of public data, not investment advice.</p>
        </>
      ) : !hasKey ? (
        <p className={styles.body}>
          <Link href="/settings" className={styles.link}>
            Add your AI provider key
          </Link>{' '}
          to get a two-line brief of what moved your portfolio. MarketMitra charges nothing for it.
        </p>
      ) : (
        <>
          <p className={styles.body}>No brief yet. Ask Mitra for a quick read on today&rsquo;s portfolio drivers.</p>
          <button type="button" className={styles.button} onClick={generate} disabled={loading}>
            {loading ? 'Thinking…' : 'Generate brief'}
          </button>
        </>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

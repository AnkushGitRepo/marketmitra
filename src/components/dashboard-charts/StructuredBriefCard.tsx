'use client';

import Link from 'next/link';
import { useState } from 'react';
import { BRIEF_SPECS, type BriefSurface } from '@/lib/ai/briefSpecs';
import { readStoredBrief, splitTickers, toneLabel, type StructuredBrief } from '@/lib/ai/structuredBrief';
import styles from './StructuredBriefCard.module.css';

interface StructuredBriefCardProps {
  readonly surface: BriefSurface;
  readonly title: string;
  /** Insight endpoint that returns `{ data: { content } }`, where `content` is the stored structured JSON. */
  readonly endpoint: string;
  /** POST body, e.g. `{ slug }` for an IPO. */
  readonly body?: Record<string, unknown>;
  /** The latest cached content, if any (older prose briefs are ignored and simply regenerated). */
  readonly initial: string | null;
  /** Whether an AI key is resolvable (server-checked). */
  readonly hasKey: boolean;
  readonly emptyText: string;
  readonly noKeyText: string;
  /** Pre-filled into Mitra chat by the footer link. */
  readonly chatPrompt: string;
}

const DISCLAIMER = 'AI-generated summary of public data, not investment advice.';

/** Text with `[TICKER]` tags rendered as links to the stock page. The server only lets tags through for tickers present in the data. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {splitTickers(text).map((seg, i) =>
        seg.type === 'ticker' ? (
          <Link key={i} href={`/stock/${encodeURIComponent(seg.value)}`} className={styles.ticker}>
            {seg.value}
          </Link>
        ) : (
          <span key={i}>{seg.value}</span>
        )
      )}
    </>
  );
}

/** A few labelled, toned points instead of a paragraph: used by the dashboard, Markets, News and IPO widgets. */
export function StructuredBriefCard({ surface, title, endpoint, body, initial, hasKey, emptyText, noKeyText, chatPrompt }: StructuredBriefCardProps) {
  const spec = BRIEF_SPECS[surface];
  const [brief, setBrief] = useState<StructuredBrief | null>(() => readStoredBrief(initial, spec));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const generate = async (force: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, force }),
      });
      const payload = (await res.json().catch(() => null)) as { data?: { content?: unknown }; error?: string } | null;
      const content = payload?.data?.content;
      const parsed = typeof content === 'string' ? readStoredBrief(content, spec) : null;
      if (!res.ok || !parsed) {
        setError(payload?.error && payload.error !== 'no_ai_key' ? payload.error : 'Could not generate the brief right now. Try again in a moment.');
        return;
      }
      setBrief(parsed);
    } catch {
      setError('Could not reach Mitra. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const labels = new Map(spec.items.map((i) => [i.key, i.label]));

  return (
    <section className={styles.card} aria-label={title}>
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.headRight}>
          {brief && (
            <button type="button" className={styles.regen} disabled={loading} onClick={() => void generate(true)}>
              {loading ? 'Writing…' : 'Regenerate'}
            </button>
          )}
          <span className={styles.badge}>Mitra</span>
        </div>
      </div>

      {loading && !brief ? (
        <div className={styles.skeleton} aria-label="Writing the brief">
          {spec.items.map((i) => (
            <div key={i.key} className={styles.skelRow}>
              <span className={styles.skelBar} />
              <span className={styles.skelLine} />
            </div>
          ))}
        </div>
      ) : brief ? (
        <>
          <ul className={styles.list}>
            {brief.items.map((item) => (
              <li key={item.key} className={styles.item}>
                <span className={`${styles.pill} ${styles[`pill_${item.tone}`]}`}>
                  {labels.get(item.key) ?? item.key}
                  <span className={styles.tone}> · {toneLabel(item.tone, spec)}</span>
                </span>
                <p className={styles.text}>
                  <RichText text={item.text} />
                </p>
              </li>
            ))}
          </ul>
          <p className={styles.meta}>{DISCLAIMER}</p>
        </>
      ) : !hasKey ? (
        <p className={styles.body}>
          <Link href="/settings?tab=ai" className={styles.link}>
            Add your AI provider key
          </Link>{' '}
          {noKeyText}
        </p>
      ) : (
        <>
          <p className={styles.body}>{emptyText}</p>
          <button type="button" className={styles.button} onClick={() => void generate(false)} disabled={loading}>
            {loading ? 'Thinking…' : 'Generate brief'}
          </button>
        </>
      )}

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {hasKey && (
        <Link href={`/mitra?q=${encodeURIComponent(chatPrompt)}`} className={styles.footer}>
          Deep dive in Mitra chat <span aria-hidden="true">→</span>
        </Link>
      )}
    </section>
  );
}

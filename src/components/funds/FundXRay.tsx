'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { BRIEF_SPECS } from '@/lib/ai/briefSpecs';
import { readStoredBrief, toneLabel } from '@/lib/ai/structuredBrief';
import { XRAY_SCOPE_NOTE, type XrayItem } from '@/lib/funds/xray';
import styles from './FundXRay.module.css';

interface FundXRayProps {
  readonly schemeCode: number;
  readonly fundName: string;
  /** The findings computed from stored figures; always shown. */
  readonly items: readonly XrayItem[];
  /** The latest cached Mitra write-up, if any. */
  readonly initial: string | null;
  /** Whether an AI key is resolvable (server-checked). */
  readonly hasKey: boolean;
}

const SPEC = BRIEF_SPECS.fund;
const LABELS = new Map(SPEC.items.map((i) => [i.key, i.label]));
const MAX_CHAT_PROMPT = 300;

/** Mitra's read of one fund against the investor's own portfolio. The numbers are ours; Mitra only words them. */
export function FundXRay({ schemeCode, fundName, items, initial, hasKey }: FundXRayProps) {
  const [brief, setBrief] = useState(() => readStoredBrief(initial, SPEC));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const headingId = useId();

  const write = async (force: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/insights/fund-xray', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: schemeCode, force }),
      });
      const payload = (await res.json().catch(() => null)) as { data?: { content?: unknown }; error?: string } | null;
      const content = payload?.data?.content;
      const parsed = typeof content === 'string' ? readStoredBrief(content, SPEC) : null;
      if (!res.ok || !parsed) {
        setError(payload?.error && payload.error !== 'no_ai_key' ? payload.error : 'Could not write this up right now. Try again in a moment.');
        return;
      }
      setBrief(parsed);
    } catch {
      setError('Could not reach Mitra. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  // Mitra's wording replaces a finding's plain text only for a key it answered; the tone stays what we computed.
  const written = new Map(brief?.items.map((i) => [i.key, i.text]));
  const chatPrompt = `Does ${fundName} fit my portfolio?`.slice(0, MAX_CHAT_PROMPT);

  return (
    <section className={styles.card} aria-labelledby={headingId} aria-busy={loading}>
      <div className={styles.head}>
        <h2 id={headingId} className={styles.title}>Mitra Fund X-Ray</h2>
        <div className={styles.headRight}>
          {brief && (
            <button type="button" className={styles.regen} disabled={loading} onClick={() => void write(true)}>
              {loading ? 'Writing…' : 'Regenerate'}
            </button>
          )}
          <span className={styles.badge}>Mitra</span>
        </div>
      </div>

      <ul className={styles.list}>
        {items.map((item) => (
          <li key={item.key} className={styles.item}>
            <span className={`${styles.pill} ${styles[`pill_${item.tone}`]}`}>
              {LABELS.get(item.key) ?? item.key}
              <span className={styles.tone}> · {toneLabel(item.tone, SPEC)}</span>
            </span>
            <p className={styles.text}>{written.get(item.key) ?? item.text}</p>
          </li>
        ))}
      </ul>

      {error && <p className={styles.error} role="alert">{error}</p>}

      <div className={styles.actions}>
        {hasKey ? (
          !brief && (
            <button type="button" className={styles.button} onClick={() => void write(false)} disabled={loading}>
              {loading ? 'Writing…' : 'Write it up with Mitra'}
            </button>
          )
        ) : (
          <p className={styles.note}>
            <Link href="/settings?tab=ai" className={styles.link}>Add your AI key</Link> to have Mitra write this up in plain words.
          </p>
        )}
        <Link href={`/mitra?q=${encodeURIComponent(chatPrompt)}`} className={styles.ask}>Ask Mitra about this fund</Link>
      </div>

      <p className={styles.meta}>
        Worked out from stored figures. {XRAY_SCOPE_NOTE} Not investment advice.
      </p>
    </section>
  );
}

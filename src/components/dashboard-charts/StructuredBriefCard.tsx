'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import { BRIEF_SPECS, IPO_VERDICT_KEYS, type BriefSurface } from '@/lib/ai/briefSpecs';
import { briefAge } from '@/lib/ai/briefAge';
import { UNRESTRICTED_DISCLAIMER } from '@/lib/ai/promptMode';
import { readStoredBrief, splitTickers, toneLabel, type BriefItem, type StructuredBrief } from '@/lib/ai/structuredBrief';
import { toneCounts } from '@/lib/dashboard/ipoBriefFacts';
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
  /** When `initial` was written (ISO). Shown as the brief's age; without it no age or expiry is applied. */
  readonly generatedAt?: string | null;
  /** A brief older than this is retired and the card offers a fresh one. Omit for no limit. */
  readonly maxAgeMs?: number;
  /** Whether an AI key is resolvable (server-checked). */
  readonly hasKey: boolean;
  readonly emptyText: string;
  readonly noKeyText: string;
  /** Pre-filled into Mitra chat by the footer link. */
  readonly chatPrompt: string;
  /** Figures drawn above the points once a brief exists (the IPO scorecard, #328). */
  readonly visual?: ReactNode;
  /** Lay the points out as tone-coloured cards with a tone summary, instead of a plain list. */
  readonly scorecard?: boolean;
}

const SKELETON_ROWS = 4;
const TICK_MS = 60_000;
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

interface ItemsProps {
  readonly items: readonly BriefItem[];
  readonly labels: ReadonlyMap<string, string>;
  readonly spec: (typeof BRIEF_SPECS)[BriefSurface];
}

function ItemPill({ item, labels, spec }: { item: BriefItem; labels: ReadonlyMap<string, string>; spec: ItemsProps['spec'] }) {
  return (
    <span className={`${styles.pill} ${styles[`pill_${item.tone}`]}`}>
      {labels.get(item.key) ?? item.key}
      <span className={styles.tone}> · {toneLabel(item.tone, spec)}</span>
    </span>
  );
}

function ItemList({ items, labels, spec }: ItemsProps) {
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={item.key} className={styles.item}>
          <ItemPill item={item} labels={labels} spec={spec} />
          <p className={styles.text}>
            <RichText text={item.text} />
          </p>
        </li>
      ))}
    </ul>
  );
}

/** The points as tone-coloured cards under a one-line tone summary. The verdict items (unrestricted mode only) get their own strip. */
function Scorecard({ items, labels, spec }: ItemsProps) {
  const regular = items.filter((i) => !IPO_VERDICT_KEYS.includes(i.key));
  const verdict = items.filter((i) => IPO_VERDICT_KEYS.includes(i.key));
  const counts = toneCounts(regular);
  const total = Math.max(regular.length, 1);
  return (
    <>
      {regular.length > 0 && (
        <div className={styles.toneSummary} role="group" aria-label={`Brief summary: ${counts.text}`}>
          <span className={styles.toneBar} aria-hidden="true">
            <span className={styles.seg_positive} style={{ flexGrow: counts.positive / total }} />
            <span className={styles.seg_neutral} style={{ flexGrow: counts.neutral / total }} />
            <span className={styles.seg_warning} style={{ flexGrow: counts.warning / total }} />
          </span>
          <span className={styles.toneText}>{counts.text}</span>
        </div>
      )}
      <ul className={styles.grid}>
        {regular.map((item) => (
          <li key={item.key} className={`${styles.cell} ${styles[`cell_${item.tone}`]} ${item.key === 'risk' ? styles.cellWide : ''}`}>
            <ItemPill item={item} labels={labels} spec={spec} />
            <p className={styles.text}>
              <RichText text={item.text} />
            </p>
          </li>
        ))}
      </ul>
      {verdict.length > 0 && (
        <div className={styles.verdict}>
          {verdict.map((item) => (
            <div key={item.key} className={styles.verdictItem}>
              <ItemPill item={item} labels={labels} spec={spec} />
              <p className={styles.text}>
                <RichText text={item.text} />
              </p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

/** A few labelled, toned points instead of a paragraph: used by the dashboard, Markets, News and IPO widgets. */
export function StructuredBriefCard({ surface, title, endpoint, body, initial, generatedAt: initialGeneratedAt = null, maxAgeMs, hasKey, emptyText, noKeyText, chatPrompt, visual, scorecard = false }: StructuredBriefCardProps) {
  const spec = BRIEF_SPECS[surface];
  const [brief, setBrief] = useState<StructuredBrief | null>(() => readStoredBrief(initial, spec));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(initialGeneratedAt);
  const [now, setNow] = useState(() => new Date());

  // Keep the age label honest, and retire a brief that expires while the page is open.
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), TICK_MS);
    return () => window.clearInterval(id);
  }, []);

  const generate = async (force: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, force }),
      });
      const payload = (await res.json().catch(() => null)) as { data?: { content?: unknown; generatedAt?: unknown }; error?: string } | null;
      const content = payload?.data?.content;
      const parsed = typeof content === 'string' ? readStoredBrief(content, spec) : null;
      if (!res.ok || !parsed) {
        setError(payload?.error && payload.error !== 'no_ai_key' ? payload.error : 'Could not generate the brief right now. Try again in a moment.');
        return;
      }
      setBrief(parsed);
      setGeneratedAt(typeof payload?.data?.generatedAt === 'string' ? payload.data.generatedAt : new Date().toISOString());
      setNow(new Date());
    } catch {
      setError('Could not reach Mitra. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  };

  const age = briefAge(generatedAt, now, maxAgeMs ?? null);
  // An expired brief is not shown as current: the card says so and offers a fresh one.
  const stale = brief !== null && age.expired;
  const current = stale ? null : brief;
  const labels = new Map(spec.items.map((i) => [i.key, i.label]));
  // Verdict items exist only in a brief the server wrote in unrestricted mode (ADR 0054, 0070).
  const unrestricted = surface === 'ipo' && (current?.items.some((i) => IPO_VERDICT_KEYS.includes(i.key)) ?? false);

  return (
    <section className={styles.card} aria-label={title}>
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        <div className={styles.headRight}>
          {current && (
            <button type="button" className={styles.regen} disabled={loading} onClick={() => void generate(true)}>
              {loading ? 'Writing…' : 'Regenerate'}
            </button>
          )}
          <span className={styles.badge}>{unrestricted ? 'Mitra · Unrestricted' : 'Mitra'}</span>
        </div>
      </div>

      {loading && !current ? (
        <div className={styles.skeleton} aria-label="Writing the brief">
          {spec.items.slice(0, SKELETON_ROWS).map((i) => (
            <div key={i.key} className={styles.skelRow}>
              <span className={styles.skelBar} />
              <span className={styles.skelLine} />
            </div>
          ))}
        </div>
      ) : current ? (
        <>
          {visual}
          {scorecard ? <Scorecard items={current.items} labels={labels} spec={spec} /> : <ItemList items={current.items} labels={labels} spec={spec} />}
          <p className={styles.meta}>
            {age.label && (
              <>
                <span suppressHydrationWarning>Generated {age.label}</span> ·{' '}
              </>
            )}
            {unrestricted ? UNRESTRICTED_DISCLAIMER : DISCLAIMER}
          </p>
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
          <p className={styles.body}>
            {stale ? `The last brief was written ${age.label}, so it may be out of date. Write a fresh one from today's data.` : emptyText}
          </p>
          <button type="button" className={styles.button} onClick={() => void generate(stale)} disabled={loading}>
            {loading ? 'Thinking…' : stale ? 'Write a fresh brief' : 'Generate brief'}
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

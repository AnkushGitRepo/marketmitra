'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { MitraCharacter } from '@/components/mitra/MitraCharacter';
import styles from './InsightCard.module.css';

interface InsightData {
  content: string;
  generatedAt: string;
}

interface InsightCardProps {
  label: string;
  endpoint: string;
  /** POST body, e.g. { symbol } or { slug } or {}. */
  body: Record<string, unknown>;
  initial: InsightData | null;
  /** Whether an AI key is resolvable for this surface (server-checked). */
  hasKey: boolean;
}

type Phase = 'idle' | 'thinking' | 'writing' | 'done';

const PHASE_LABEL: Record<Phase, string> = {
  idle: '',
  thinking: 'Thinking…',
  writing: 'Writing…',
  done: '',
};

// The backend returns the full insight in one response (see
// src/app/api/insights/*), not a token stream — reproducing a real
// streaming feel here is a client-side reveal over the already-fetched
// text, not a network change. Tick count is fixed rather than a fixed
// per-character delay, so a long insight doesn't take proportionally
// longer to finish "writing."
const REVEAL_TICKS = 90;
const REVEAL_TICK_MS = 16;

function relative(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function InsightCard({ label, endpoint, body, initial, hasKey }: InsightCardProps) {
  const [data, setData] = useState<InsightData | null>(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Content restored from a previous session (the `initial` prop) is
  // already-read, not freshly generated — show it complete immediately
  // rather than replaying the reveal on every page load.
  const [revealed, setRevealed] = useState(initial?.content.length ?? 0);
  const [hovered, setHovered] = useState(false);
  const revealTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (revealTimer.current) clearInterval(revealTimer.current);
    },
    []
  );

  const startReveal = (content: string) => {
    if (revealTimer.current) clearInterval(revealTimer.current);
    if (prefersReducedMotion() || content.length === 0) {
      setRevealed(content.length);
      return;
    }
    setRevealed(0);
    const chunk = Math.max(1, Math.ceil(content.length / REVEAL_TICKS));
    revealTimer.current = setInterval(() => {
      setRevealed((prev) => {
        const next = prev + chunk;
        if (next >= content.length) {
          if (revealTimer.current) clearInterval(revealTimer.current);
          return content.length;
        }
        return next;
      });
    }, REVEAL_TICK_MS);
  };

  const run = async (force: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, force }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        setError(payload?.error === 'no_ai_key' ? 'no_ai_key' : (payload?.error ?? 'Could not generate.'));
        return;
      }
      const next = { content: payload.data.content, generatedAt: payload.data.generatedAt };
      setData(next);
      startReveal(next.content);
    } finally {
      setLoading(false);
    }
  };

  const writing = data !== null && revealed < data.content.length;
  const phase: Phase = loading ? 'thinking' : writing ? 'writing' : data ? 'done' : 'idle';
  const visibleContent = data ? data.content.slice(0, revealed) : '';

  // Before anything has been asked for yet — including the "no key" /
  // "key rejected" cases, which are just a blocked version of the same
  // blank slate — the character is the hero of the card, not a small icon
  // next to a text label. Once a request is in flight or content exists,
  // it shrinks into the compact header role instead.
  const isBlankSlate = !data && !loading && (error === null || error === 'no_ai_key');

  return (
    <div
      className={`${styles.card} ${styles[`phase_${phase}`]}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setHovered(true)}
      onBlur={() => setHovered(false)}
    >
      {isBlankSlate ? (
        <div className={styles.hero}>
          <MitraCharacter phase="idle" active={hovered} size={76} />
          <span className={styles.heroLabel}>{label}</span>
          {!hasKey || error === 'no_ai_key' ? (
            <p className={styles.empty} style={{ textAlign: 'center' }}>
              <Link href="/dashboard/settings" className={styles.link}>
                Add your AI provider key
              </Link>{' '}
              {hasKey ? 'in Settings to generate this.' : 'to generate insights. Nothing is charged by MarketMitra.'}
            </p>
          ) : (
            <button type="button" className={styles.generate} onClick={() => run(false)}>
              Generate {label.toLowerCase()}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className={styles.head}>
            <div className={styles.brand}>
              <MitraCharacter phase={phase} active={hovered} />
              <span className={styles.label}>{label}</span>
              {PHASE_LABEL[phase] && <span className={styles.phaseLabel}>{PHASE_LABEL[phase]}</span>}
            </div>
            {data && phase === 'done' && (
              <button type="button" className={styles.refresh} onClick={() => run(true)}>
                Regenerate
              </button>
            )}
          </div>

          {error && error !== 'no_ai_key' ? (
            <p className={styles.error}>{error}</p>
          ) : data ? (
            <>
              <p className={styles.body}>
                {visibleContent}
                {writing && <span className={styles.caret} aria-hidden="true" />}
              </p>
              {phase === 'done' && <p className={styles.meta}>AI-generated · {relative(data.generatedAt)}</p>}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

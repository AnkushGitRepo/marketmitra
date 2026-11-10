'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MarkdownLite } from '@/components/MarkdownLite';
import styles from './page.module.css';

interface RunView {
  id: string;
  symbol: string;
  companyName: string | null;
  status: 'queued' | 'running' | 'done' | 'error';
  phase: 'analysts' | 'debate' | 'synthesis' | 'complete';
  debateRoundsDone: number;
  briefing: string | null;
  briefingRegenerated: boolean;
  error: string | null;
}

const STEPS: { key: RunView['phase']; label: string }[] = [
  { key: 'analysts', label: 'Analyst panel' },
  { key: 'debate', label: 'Bull vs bear debate' },
  { key: 'synthesis', label: 'Synthesis' },
];
const ORDER: RunView['phase'][] = ['analysts', 'debate', 'synthesis', 'complete'];

export function AgentsPageClient() {
  const [symbol, setSymbol] = useState('');
  const [run, setRun] = useState<RunView | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noKey, setNoKey] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  const poll = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/agents/run/${id}`);
      const data = (await res.json().catch(() => null)) as { success: boolean; data?: RunView } | null;
      if (data?.success && data.data) {
        setRun(data.data);
        if (data.data.status === 'done' || data.data.status === 'error') stopPolling();
      }
    } catch {
      /* keep polling */
    }
  }, []);

  useEffect(() => {
    if (!run || (run.status !== 'queued' && run.status !== 'running')) {
      stopPolling();
      return;
    }
    if (timer.current) return;
    timer.current = setInterval(() => poll(run.id), 4000);
    return stopPolling;
  }, [run, poll]);

  const start = async () => {
    const sym = symbol.trim().toUpperCase();
    if (!sym || starting) return;
    setStarting(true);
    setError(null);
    setNoKey(false);
    setRun(null);
    try {
      const res = await fetch('/api/agents/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: sym }),
      });
      const data = (await res.json().catch(() => null)) as
        | { success: boolean; data?: { id: string }; error?: string }
        | null;
      if (!res.ok || !data?.success || !data.data) {
        if (data?.error === 'no_ai_key') setNoKey(true);
        else setError(data?.error ?? 'Could not start the analysis.');
        return;
      }
      const initial: RunView = {
        id: data.data.id,
        symbol: sym,
        companyName: null,
        status: 'queued',
        phase: 'analysts',
        debateRoundsDone: 0,
        briefing: null,
        briefingRegenerated: false,
        error: null,
      };
      setRun(initial);
      poll(data.data.id);
    } catch {
      setError('Could not start the analysis.');
    } finally {
      setStarting(false);
    }
  };

  const reset = () => {
    stopPolling();
    setRun(null);
    setError(null);
  };

  const activeIndex = run ? ORDER.indexOf(run.phase) : -1;
  const running = run?.status === 'queued' || run?.status === 'running';

  return (
    <div className={styles.pageRoot}>
      <p className={styles.eyebrow}>Agents</p>
      <h1 className={styles.h1}>Multi-agent analysis</h1>
      <p className={styles.introNote}>
        A panel of analyst agents works one stock from four angles, then a bull and a bear
        researcher debate it, and a lead writes up a balanced briefing — bull case, bear case,
        where they agree, the open questions, and where the evidence currently leans. It never
        tells you to buy, sell, or hold. Deeper and slower than a{' '}
        <Link href="/research">research brief</Link>. See what Mitra has been doing in the{' '}
        <Link href="/mitra-activity">activity log</Link>.
      </p>

      {!run && (
        <div className={styles.card}>
          <div className={styles.form}>
            <div className={styles.field}>
              <label className={styles.fieldLabel} htmlFor="a-symbol">
                NSE symbol
              </label>
              <input
                id="a-symbol"
                className={styles.input}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="RELIANCE"
                onKeyDown={(e) => e.key === 'Enter' && start()}
              />
            </div>
            <button type="button" className={styles.btnPrimary} onClick={start} disabled={starting}>
              {starting ? 'Starting…' : 'Run analysis'}
            </button>
          </div>
          <p className={styles.costNote}>
            One run makes roughly 15–20 calls on your AI provider key and takes a few minutes.
            Only one run at a time.
          </p>
          {noKey && (
            <p className={styles.hint}>
              This needs your AI provider key. <Link href="/settings">Add it in Settings</Link> — it
              stays on this deployment and nothing is charged by MarketMitra.
            </p>
          )}
          {error && <p className={styles.error}>{error}</p>}
        </div>
      )}

      {run && running && (
        <div className={`${styles.card} ${styles.progressCard}`}>
          <div className={styles.steps}>
            {STEPS.map((s) => {
              const state =
                activeIndex > ORDER.indexOf(s.key)
                  ? 'done'
                  : activeIndex === ORDER.indexOf(s.key)
                    ? 'active'
                    : 'pending';
              return (
                <span key={s.key} className={styles.step} data-state={state}>
                  {s.label}
                  {s.key === 'debate' && state !== 'pending' ? ` (${run.debateRoundsDone}/2)` : ''}
                </span>
              );
            })}
          </div>
          <p className={styles.progressText}>
            Working on {run.symbol}. You can leave this page — the run continues — but the result
            isn’t saved, so come back before you navigate away if you want to read it.
          </p>
        </div>
      )}

      {run?.status === 'error' && (
        <div className={`${styles.card} ${styles.progressCard}`}>
          <p className={styles.error}>{run.error ?? 'The run failed.'}</p>
          <button type="button" className={styles.btnGhost} onClick={reset}>
            Start over
          </button>
        </div>
      )}

      {run?.status === 'done' && run.briefing && (
        <div className={`${styles.card} ${styles.reportCard}`}>
          <MarkdownLite text={run.briefing} className={styles.brief} />
          <p className={styles.reportMeta}>
            {run.companyName ?? run.symbol} · multi-agent briefing · not investment advice
            {run.briefingRegenerated ? ' · redrafted once to keep it non-directional' : ''}
          </p>
          <button type="button" className={styles.btnGhost} onClick={reset} style={{ marginTop: 12 }}>
            New analysis
          </button>
        </div>
      )}
    </div>
  );
}

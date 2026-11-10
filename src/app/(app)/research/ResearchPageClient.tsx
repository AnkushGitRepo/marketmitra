'use client';

import Link from 'next/link';
import { useState } from 'react';
import { MarkdownLite } from '@/components/MarkdownLite';
import styles from './page.module.css';

type Tab = 'company' | 'theme' | 'portfolio' | 'comparison';

const TABS: { id: Tab; label: string }[] = [
  { id: 'company', label: 'Company' },
  { id: 'theme', label: 'Theme' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'comparison', label: 'Compare' },
];

interface Report {
  content: string;
  model: string;
  generatedAt: string;
}

export function ResearchPageClient() {
  const [tab, setTab] = useState<Tab>('company');
  const [symbol, setSymbol] = useState('');
  const [theme, setTheme] = useState('');
  const [compare, setCompare] = useState<string[]>(['', '']);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noKey, setNoKey] = useState(false);

  const subjectFor = (): Record<string, unknown> | null => {
    if (tab === 'company') return symbol.trim() ? { type: 'company', symbol: symbol.trim().toUpperCase() } : null;
    if (tab === 'theme') return theme.trim().length >= 2 ? { type: 'theme', text: theme.trim() } : null;
    if (tab === 'portfolio') return { type: 'portfolio' };
    const syms = compare.map((s) => s.trim().toUpperCase()).filter(Boolean);
    return syms.length >= 2 ? { type: 'comparison', symbols: syms } : null;
  };

  const run = async () => {
    const subject = subjectFor();
    if (!subject || busy) {
      if (!subject) setError('Fill in the field(s) above first.');
      return;
    }
    setBusy(true);
    setError(null);
    setNoKey(false);
    setReport(null);
    try {
      const res = await fetch('/api/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject }),
      });
      const data = (await res.json().catch(() => null)) as
        | { success: boolean; data?: Report; error?: string }
        | null;
      if (!res.ok || !data?.success || !data.data) {
        if (data?.error === 'no_ai_key') setNoKey(true);
        else setError(data?.error ?? 'Could not generate the brief. Try again shortly.');
        return;
      }
      setReport(data.data);
    } catch {
      setError('Could not generate the brief. Try again shortly.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={styles.pageRoot}>
      <p className={styles.eyebrow}>Research</p>
      <h1 className={styles.h1}>Research brief</h1>
      <p className={styles.introNote}>
        A longer, structured read on a company, a theme, your whole portfolio, or a
        head-to-head — synthesised from fundamentals, filings, and indexed news. Neutral,
        never a buy/sell call. Not saved: generate a fresh one whenever, or paste it into a{' '}
        <Link href="/notes">note</Link> to keep it.
      </p>

      <div className={styles.card}>
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={styles.tab}
              data-active={tab === t.id}
              onClick={() => {
                setTab(t.id);
                setError(null);
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className={styles.form}>
          {tab === 'company' && (
            <div>
              <label className={styles.fieldLabel} htmlFor="r-symbol">
                NSE symbol
              </label>
              <input
                id="r-symbol"
                className={styles.input}
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                placeholder="RELIANCE"
                onKeyDown={(e) => e.key === 'Enter' && run()}
              />
            </div>
          )}

          {tab === 'theme' && (
            <div>
              <label className={styles.fieldLabel} htmlFor="r-theme">
                Theme or sector
              </label>
              <input
                id="r-theme"
                className={styles.input}
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="Indian IT sector outlook"
                onKeyDown={(e) => e.key === 'Enter' && run()}
              />
            </div>
          )}

          {tab === 'portfolio' && (
            <p className={styles.hint}>Researches every holding in your portfolio.</p>
          )}

          {tab === 'comparison' && (
            <div>
              <label className={styles.fieldLabel}>Symbols to compare (2–4)</label>
              <div className={styles.compareRow}>
                {compare.map((val, i) => (
                  <input
                    key={i}
                    className={styles.input}
                    value={val}
                    onChange={(e) => {
                      const next = compare.slice();
                      next[i] = e.target.value.toUpperCase();
                      setCompare(next);
                    }}
                    placeholder={i === 0 ? 'TCS' : i === 1 ? 'INFY' : 'WIPRO'}
                  />
                ))}
                {compare.length < 4 && (
                  <button
                    type="button"
                    className={styles.btnGhost}
                    onClick={() => setCompare([...compare, ''])}
                  >
                    + symbol
                  </button>
                )}
              </div>
            </div>
          )}

          {noKey && (
            <p className={styles.hint}>
              Mitra needs your AI provider key. <Link href="/settings">Add it in Settings</Link> — it
              stays on this deployment and nothing is charged by MarketMitra.
            </p>
          )}
          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.formActions}>
            <button type="button" className={styles.btnPrimary} onClick={run} disabled={busy}>
              {busy ? 'Researching…' : report ? 'Regenerate' : 'Generate brief'}
            </button>
          </div>
        </div>
      </div>

      {busy && <p className={styles.loading}>Gathering data and writing the brief — this can take a minute.</p>}

      {report && !busy && (
        <div className={`${styles.card} ${styles.reportCard}`}>
          <MarkdownLite text={report.content} className={styles.brief} />
          <p className={styles.reportMeta}>
            AI-generated ({report.model}) · {new Date(report.generatedAt).toLocaleString()} · not
            investment advice
          </p>
        </div>
      )}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { MarkdownLite } from '@/components/MarkdownLite';
import { InfoPopover } from '@/components/common/InfoPopover';
import { SymbolCombobox } from '@/components/research/SymbolCombobox';
import { ReportActions } from '@/components/research/ReportActions';
import { ReportBlocks } from '@/components/research/blocks/ReportBlocks';
import { CompanyReportView } from '@/components/research/report/CompanyReportView';
import { useCompanyReport } from '@/components/research/report/useCompanyReport';
import type { ResearchBlock } from '@/lib/research/blocks';
import type { SuggestedNote } from '@/lib/research/saveNote';
import { THEME_PRESETS } from '@/lib/research/themes';
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
  /** The model's prose (markdown); the figures are in `blocks`. */
  summary?: string;
  blocks?: ResearchBlock[];
  /** How "Save to Notes" files this report. */
  note?: SuggestedNote;
  model: string;
  generatedAt: string;
}

/** Cards, charts and tables first, then the prose, then the thesis cards. A report without blocks is plain markdown. */
function ReportBody({ report }: { readonly report: Report }) {
  const blocks = report.blocks ?? [];
  const figures = blocks.filter((b) => b.type !== 'thesis_bento');
  const thesis = blocks.filter((b) => b.type === 'thesis_bento');
  if (blocks.length === 0) return <MarkdownLite text={report.content} className={styles.brief} />;
  return (
    <div className={styles.reportStack}>
      <ReportBlocks blocks={figures} />
      {report.summary && <MarkdownLite text={report.summary} className={styles.brief} />}
      <ReportBlocks blocks={thesis} />
    </div>
  );
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
  const reportRef = useRef<HTMLDivElement>(null);
  const company = useCompanyReport();
  const companyRunning = company.phase === 'running';

  const subjectFor = (): Record<string, unknown> | null => {
    if (tab === 'company') return symbol.trim() ? { type: 'company', symbol: symbol.trim().toUpperCase() } : null;
    if (tab === 'theme') return theme.trim().length >= 2 ? { type: 'theme', text: theme.trim() } : null;
    if (tab === 'portfolio') return { type: 'portfolio' };
    const syms = compare.map((s) => s.trim().toUpperCase()).filter(Boolean);
    return syms.length >= 2 ? { type: 'comparison', symbols: syms } : null;
  };

  const run = async () => {
    const subject = subjectFor();
    if (!subject || busy || companyRunning) {
      if (!subject) setError('Fill in the field(s) above first.');
      return;
    }
    if (subject.type === 'company') {
      // A company gets the multi-chapter report, streamed as it is written.
      setError(null);
      setNoKey(false);
      await company.start(String(subject.symbol));
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
      <div className={styles.titleRow}>
        <h1 className={styles.h1}>Research brief</h1>
        <InfoPopover label="About the research brief">
          <p>
            A longer, structured read on a company, a theme, your whole portfolio, or a head-to-head,
            synthesised from fundamentals, filings, and indexed news. Neutral, never a buy/sell call.
            Not saved: generate a fresh one whenever, or paste it into a <Link href="/notes">note</Link> to
            keep it.
          </p>
        </InfoPopover>
      </div>
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
                Company (NSE symbol or name)
              </label>
              <SymbolCombobox
                id="r-symbol"
                label="NSE symbol or company name"
                value={symbol}
                onChange={setSymbol}
                onSubmit={run}
                placeholder="RELIANCE, or a company name"
              />
            </div>
          )}

          {tab === 'theme' && (
            <div>
              <label className={styles.fieldLabel} htmlFor="r-theme">
                Theme or sector
              </label>
              <div className={styles.pills}>
                {THEME_PRESETS.map((p) => (
                  <button
                    key={p.label}
                    type="button"
                    className={styles.tab}
                    data-active={theme === p.label}
                    onClick={() => setTheme(p.label)}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              <input
                id="r-theme"
                className={styles.input}
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="Pick one above, or describe a sector or theme"
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
                  <SymbolCombobox
                    key={i}
                    id={`r-compare-${i}`}
                    label={`Company ${i + 1} to compare`}
                    value={val}
                    onChange={(next) => setCompare(compare.map((c, j) => (j === i ? next : c)))}
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

          {(noKey || (tab === 'company' && company.failure?.noKey)) && (
            <p className={styles.hint}>
              Mitra needs your AI provider key. <Link href="/settings">Add it in Settings</Link> — it
              stays on this deployment and nothing is charged by MarketMitra.
            </p>
          )}
          {error && <p className={styles.error}>{error}</p>}
          {tab === 'company' && company.failure && !company.failure.noKey && <p className={styles.error}>{company.failure.message}</p>}

          <div className={styles.formActions}>
            <button type="button" className={styles.btnPrimary} onClick={run} disabled={busy || companyRunning}>
              {busy || companyRunning ? 'Researching…' : tab === 'company' ? (company.state.name ? 'Regenerate report' : 'Generate report') : report ? 'Regenerate' : 'Generate brief'}
            </button>
          </div>
        </div>
      </div>

      {busy && tab !== 'company' && <p className={styles.loading}>Gathering data and writing the brief — this can take a minute.</p>}
      {tab === 'company' && companyRunning && !company.state.name && <p className={styles.loading}>Gathering the data held for this company…</p>}

      {tab === 'company' && company.state.name && (
        <div className={`${styles.card} ${styles.reportCard}`} ref={reportRef}>
          <ReportActions report={company.state.done ? { content: company.state.done.content, model: company.state.done.model, generatedAt: company.state.done.generatedAt, note: company.state.done.note } : { content: '', model: '', generatedAt: '' }} printRef={reportRef} />
          <CompanyReportView state={company.state} running={companyRunning} />
          {company.state.error && <p className={styles.error}>{company.state.error}</p>}
          {company.state.done && (
            <p className={styles.reportMeta}>
              AI-generated ({company.state.done.model}) · {new Date(company.state.done.generatedAt).toLocaleString()} · This is a synthesis of public data, not investment advice
            </p>
          )}
        </div>
      )}

      {tab !== 'company' && report && !busy && (
        <div className={`${styles.card} ${styles.reportCard}`} ref={reportRef}>
          <ReportActions report={report} printRef={reportRef} />
          <ReportBody report={report} />
          <p className={styles.reportMeta}>
            AI-generated ({report.model}) · {new Date(report.generatedAt).toLocaleString()} · not
            investment advice
          </p>
        </div>
      )}
    </div>
  );
}

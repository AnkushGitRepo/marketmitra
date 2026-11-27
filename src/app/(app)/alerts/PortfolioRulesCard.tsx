'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { DEFAULT_PORTFOLIO_RULES } from '@/lib/alerts/portfolioRules';
import { draftFromParams, paramsFromDraft, type RulesDraft } from '@/lib/alerts/rulesForm';
import type { PortfolioRulesParams } from '@/lib/alerts/types';
import styles from './PortfolioRulesCard.module.css';

interface PortfolioRulesCardProps {
  /** The saved rules, or null when the user has not set any. */
  readonly saved: PortfolioRulesParams | null;
}

/** The user's own portfolio rules. MarketMitra reports when one is crossed, in plain numbers; it never says what to do. */
export function PortfolioRulesCard({ saved }: PortfolioRulesCardProps) {
  const router = useRouter();
  const [draft, setDraft] = useState<RulesDraft>(() => draftFromParams(saved, DEFAULT_PORTFOLIO_RULES));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const set = <K extends keyof RulesDraft>(key: K, value: RulesDraft[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setMessage(null);
  };

  const save = async () => {
    const built = paramsFromDraft(draft);
    if (!built.ok) return setMessage({ text: built.error, error: true });
    setBusy(true);
    try {
      const res = await fetch('/api/alerts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'portfolio_rules', params: built.params }) });
      if (!res.ok) throw new Error('save');
      setMessage({ text: 'Saved. You will be told when one of these is crossed.', error: false });
      router.refresh();
    } catch {
      setMessage({ text: 'Could not save your rules. Try again.', error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="rules-title">
      <h2 id="rules-title" className={styles.title}>Portfolio rules</h2>
      <p className={styles.hint}>Rules you set. When a holding crosses one, you get a plain statement of the numbers. Nothing here suggests what to do about it.</p>

      <div className={styles.rows}>
        <div className={styles.row}>
          <label className={styles.check}><input type="checkbox" checked={draft.milestones} onChange={(e) => set('milestones', e.target.checked)} /> Gain on average cost reaches</label>
          <span className={styles.field}><input className={styles.input} value={draft.milestoneText} disabled={!draft.milestones} onChange={(e) => set('milestoneText', e.target.value)} aria-label="Gain levels in percent" /> %</span>
        </div>
        <div className={styles.row}>
          <label className={styles.check}><input type="checkbox" checked={draft.drawdown} onChange={(e) => set('drawdown', e.target.checked)} /> Price falls below average cost by</label>
          <span className={styles.field}><input className={styles.input} value={draft.drawdownText} disabled={!draft.drawdown} onChange={(e) => set('drawdownText', e.target.value)} aria-label="Loss levels in percent" /> %</span>
        </div>
        <div className={styles.row}>
          <label className={styles.check}><input type="checkbox" checked={draft.weight} onChange={(e) => set('weight', e.target.checked)} /> One stock is more than</label>
          <span className={styles.field}><input className={styles.inputShort} inputMode="decimal" value={draft.weightText} disabled={!draft.weight} onChange={(e) => set('weightText', e.target.value)} aria-label="Single-stock share in percent" /> % of portfolio value</span>
        </div>
        <div className={styles.row}>
          <label className={styles.check}><input type="checkbox" checked={draft.high} onChange={(e) => set('high', e.target.checked)} /> A holding reaches its 52-week high</label>
        </div>
      </div>

      <p className={styles.note}>A drop from a holding&rsquo;s own peak is covered by each holding&rsquo;s trailing stop, listed below.</p>
      <div className={styles.actions}>
        <button type="button" className={styles.save} disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save rules'}</button>
        {message ? <span className={message.error ? styles.error : styles.ok} role={message.error ? 'alert' : 'status'}>{message.text}</span> : null}
      </div>
    </section>
  );
}

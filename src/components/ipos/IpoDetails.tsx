'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { InsightCard } from '@/components/dashboard-charts/InsightCard';
import type { IpoTrigger } from '@/lib/alerts/types';
import type { Ipo } from '@/lib/dashboard/iposApi';
import { fmtDay } from '@/lib/dashboard/ipoView';
import { safeHref } from '@/lib/security/safeHref';
import styles from './IpoDetails.module.css';

const TRIGGER_LABELS: Record<IpoTrigger, string> = {
  opens: 'When it opens',
  last_day: 'Last day to apply',
  allotment_listing: 'Allotment / listing day',
  gmp_threshold: 'GMP crosses a level',
};

/** The extra detail behind a card: GMP range, anchor, rating, the AI brief and a per-IPO alert. */
export function IpoDetails({ ipo, aiKeyAvailable }: { readonly ipo: Ipo; readonly aiKeyAvailable: boolean }) {
  const router = useRouter();
  const [trigger, setTrigger] = useState<IpoTrigger>('opens');
  const [gmpPct, setGmpPct] = useState('20');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setAlert = async () => {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const params: Record<string, unknown> = { ipoSlug: ipo.slug, trigger };
      if (trigger === 'gmp_threshold') params.gmpThresholdPct = Number(gmpPct) || 20;
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ipo', params }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
      } else {
        setError('Could not set that alert. Try again.');
      }
    } catch {
      setError('Could not reach the server. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.detail}>
      <dl className={styles.grid}>
        <div>
          <dt>GMP range</dt>
          <dd>{ipo.gmp_low !== null && ipo.gmp_high !== null ? `₹${ipo.gmp_low} – ₹${ipo.gmp_high}` : '—'}</dd>
        </div>
        <div>
          <dt>Anchor</dt>
          <dd>{ipo.anchor === null ? '—' : ipo.anchor ? 'Yes' : 'No'}</dd>
        </div>
        <div>
          <dt>Rating</dt>
          <dd>{ipo.rating === null ? '—' : `${ipo.rating} / 5`}</dd>
        </div>
        <div>
          <dt>GMP updated</dt>
          <dd>{ipo.gmp_updated_at ? fmtDay(ipo.gmp_updated_at.slice(0, 10)) : '—'}</dd>
        </div>
      </dl>

      <p className={styles.caveat}>
        GMP is an unofficial grey-market estimate compiled by a third-party tracker, not from any exchange, and not a
        prediction.
        {ipo.source_url && (
          <>
            {' '}
            <a href={safeHref(ipo.source_url)} target="_blank" rel="noopener noreferrer">
              Source ↗
            </a>
          </>
        )}
      </p>

      <div className={styles.insight}>
        <InsightCard label="IPO brief" endpoint="/api/insights/ipo" body={{ slug: ipo.slug }} initial={null} hasKey={aiKeyAvailable} />
      </div>

      <div className={styles.alertRow}>
        <span className={styles.alertLabel}>Alert me</span>
        <select className={styles.select} value={trigger} onChange={(e) => setTrigger(e.target.value as IpoTrigger)} aria-label="Alert trigger">
          {(Object.keys(TRIGGER_LABELS) as IpoTrigger[]).map((t) => (
            <option key={t} value={t}>
              {TRIGGER_LABELS[t]}
            </option>
          ))}
        </select>
        {trigger === 'gmp_threshold' && (
          <input
            className={styles.input}
            type="number"
            min="1"
            value={gmpPct}
            onChange={(e) => setGmpPct(e.target.value)}
            aria-label="GMP % threshold"
          />
        )}
        <button type="button" className={styles.button} onClick={setAlert} disabled={saving}>
          {saving ? 'Saving…' : saved ? 'Alert set ✓' : 'Set alert'}
        </button>
      </div>
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

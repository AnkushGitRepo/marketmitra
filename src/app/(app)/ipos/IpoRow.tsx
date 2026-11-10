'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Ipo } from '@/lib/dashboard/iposApi';
import { ipoPhase, PHASE_LABEL } from '@/lib/dashboard/ipoFilters';
import type { IpoTrigger } from '@/lib/alerts/types';
import { InsightCard } from '@/components/dashboard-charts/InsightCard';
import styles from './page.module.css';
import { safeHref } from '@/lib/security/safeHref';

const TRIGGER_LABELS: Record<IpoTrigger, string> = {
  opens: 'When it opens',
  last_day: 'Last day to apply',
  allotment_listing: 'Allotment / listing day',
  gmp_threshold: 'GMP crosses a level',
};

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

function fmtCr(n: number | null): string {
  return n === null ? '—' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })} Cr`;
}

function gmpText(ipo: Ipo): { value: string; tone: 'gain' | 'loss' | 'flat' } {
  if (ipo.gmp === null) return { value: 'GMP —', tone: 'flat' };
  const pct = ipo.gmp_pct !== null ? ` (${ipo.gmp_pct >= 0 ? '+' : ''}${ipo.gmp_pct}%)` : '';
  return {
    value: `₹${ipo.gmp}${pct}`,
    tone: ipo.gmp > 0 ? 'gain' : ipo.gmp < 0 ? 'loss' : 'flat',
  };
}

export function IpoRow({ ipo, today, aiKeyAvailable }: { ipo: Ipo; today: string; aiKeyAvailable: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [trigger, setTrigger] = useState<IpoTrigger>('opens');
  const [gmpPct, setGmpPct] = useState('20');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const gmp = gmpText(ipo);
  const phase = ipoPhase(ipo, today);

  const setAlert = async () => {
    setSaving(true);
    setSaved(false);
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
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <li className={styles.ipoRow}>
      <button type="button" className={styles.ipoRowHead} onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <div className={styles.ipoName}>
          <span className={styles.ipoNameText}>{ipo.name}</span>
          <span className={styles.pill}>{ipo.category === 'sme' ? 'SME' : 'Mainboard'}</span>
          <span className={`${styles.pill} ${styles[`status_${phase}`]}`}>{PHASE_LABEL[phase]}</span>
        </div>
        <div className={styles.ipoQuick}>
          <span className={`${styles.gmp} ${styles[`gmp_${gmp.tone}`]}`} title="Unofficial grey-market premium — not from any exchange">
            {gmp.value}
          </span>
          <span className={styles.ipoDates}>
            {fmtDate(ipo.open_date)} – {fmtDate(ipo.close_date)}
          </span>
          <span className={styles.chevron}>{open ? '▾' : '▸'}</span>
        </div>
      </button>

      {open && (
        <div className={styles.ipoDetail}>
          <div className={styles.detailGrid}>
            <div><span className={styles.dLabel}>Price band</span>{ipo.price ? `₹${ipo.price}` : '—'}</div>
            <div><span className={styles.dLabel}>Lot size</span>{ipo.lot_size ?? '—'}</div>
            <div><span className={styles.dLabel}>Issue size</span>{fmtCr(ipo.ipo_size_cr)}</div>
            <div><span className={styles.dLabel}>Subscription</span>{ipo.subscription_times !== null ? `${ipo.subscription_times}x` : '—'}</div>
            <div><span className={styles.dLabel}>Allotment</span>{fmtDate(ipo.allotment_date)}</div>
            <div><span className={styles.dLabel}>Listing</span>{fmtDate(ipo.listing_date)}</div>
            <div><span className={styles.dLabel}>Anchor</span>{ipo.anchor === null ? '—' : ipo.anchor ? 'Yes' : 'No'}</div>
            <div>
              <span className={styles.dLabel}>GMP range</span>
              {ipo.gmp_low !== null && ipo.gmp_high !== null ? `₹${ipo.gmp_low} – ₹${ipo.gmp_high}` : '—'}
            </div>
          </div>

          <p className={styles.gmpCaveat}>
            GMP is an unofficial grey-market estimate compiled by a third-party tracker — not from any
            exchange, and not a prediction.
            {ipo.source_url && (
              <>
                {' '}
                <a href={safeHref(ipo.source_url)} target="_blank" rel="noopener noreferrer">
                  Source ↗
                </a>
              </>
            )}
          </p>

          <div style={{ margin: '4px 0 14px' }}>
            <InsightCard
              label="IPO brief"
              endpoint="/api/insights/ipo"
              body={{ slug: ipo.slug }}
              initial={null}
              hasKey={aiKeyAvailable}
            />
          </div>

          <div className={styles.setAlertRow}>
            <span className={styles.dLabel}>Alert me</span>
            <select className={styles.select} value={trigger} onChange={(e) => setTrigger(e.target.value as IpoTrigger)}>
              {(Object.keys(TRIGGER_LABELS) as IpoTrigger[]).map((t) => (
                <option key={t} value={t}>
                  {TRIGGER_LABELS[t]}
                </option>
              ))}
            </select>
            {trigger === 'gmp_threshold' && (
              <input
                className={styles.inputSmall}
                type="number"
                min="1"
                value={gmpPct}
                onChange={(e) => setGmpPct(e.target.value)}
                aria-label="GMP % threshold"
              />
            )}
            <button type="button" className={styles.btnSmall} onClick={setAlert} disabled={saving}>
              {saving ? 'Saving…' : saved ? 'Alert set ✓' : 'Set alert'}
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

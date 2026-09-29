'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { Alert, AlertType } from '@/lib/alerts/types';
import { alertTypeLabel } from './alertText';
import styles from './page.module.css';

const TYPES: AlertType[] = [
  'price_threshold',
  'percent_move',
  'week52_breach',
  'portfolio_pnl',
  'trailing_stop',
  'cumulative_drawdown',
];

interface AlertFormProps {
  /** Present = edit mode (type + symbol are fixed, only params/note/rearm change). */
  alert?: Alert;
  initialSymbol?: string;
  onClose: () => void;
}

interface Draft {
  type: AlertType;
  symbol: string;
  // price_threshold
  ptDirection: 'above' | 'below';
  ptThreshold: string;
  // percent_move
  pmDirection: 'up' | 'down' | 'either';
  pmPct: string;
  // week52_breach
  wkEdge: 'high' | 'low';
  wkWithinPct: string;
  // portfolio_pnl
  pnlMetric: 'total_value' | 'unrealized_pnl' | 'unrealized_pnl_pct';
  pnlDirection: 'above' | 'below';
  pnlThreshold: string;
  // trailing_stop
  tsTrailPct: string;
  // cumulative_drawdown
  cdWindowSessions: string;
  cdPct: string;
  // shared
  note: string;
  rearm: boolean;
  cooldownMinutes: string;
}

function draftFromAlert(alert: Alert | undefined, initialSymbol: string | undefined): Draft {
  const base: Draft = {
    type: 'price_threshold',
    symbol: initialSymbol?.toUpperCase() ?? '',
    ptDirection: 'above',
    ptThreshold: '',
    pmDirection: 'up',
    pmPct: '5',
    wkEdge: 'high',
    wkWithinPct: '0',
    pnlMetric: 'unrealized_pnl',
    pnlDirection: 'below',
    pnlThreshold: '',
    tsTrailPct: '10',
    cdWindowSessions: '4',
    cdPct: '15',
    note: '',
    rearm: false,
    cooldownMinutes: '60',
  };
  if (!alert) return base;

  const p = alert.params as Record<string, unknown>;
  return {
    ...base,
    type: alert.type,
    symbol: alert.symbol ?? '',
    ptDirection: (p.direction as Draft['ptDirection']) ?? 'above',
    ptThreshold: alert.type === 'price_threshold' ? String(p.threshold ?? '') : base.ptThreshold,
    pmDirection: (p.direction as Draft['pmDirection']) ?? 'up',
    pmPct: alert.type === 'percent_move' ? String(p.pct ?? '5') : base.pmPct,
    wkEdge: (p.edge as Draft['wkEdge']) ?? 'high',
    wkWithinPct: alert.type === 'week52_breach' ? String(p.withinPct ?? '0') : base.wkWithinPct,
    pnlMetric: (p.metric as Draft['pnlMetric']) ?? 'unrealized_pnl',
    pnlDirection: alert.type === 'portfolio_pnl' ? ((p.direction as Draft['pnlDirection']) ?? 'below') : base.pnlDirection,
    pnlThreshold: alert.type === 'portfolio_pnl' ? String(p.threshold ?? '') : base.pnlThreshold,
    tsTrailPct: alert.type === 'trailing_stop' ? String(p.trailPct ?? '10') : base.tsTrailPct,
    cdWindowSessions: alert.type === 'cumulative_drawdown' ? String(p.windowSessions ?? '4') : base.cdWindowSessions,
    cdPct: alert.type === 'cumulative_drawdown' ? String(p.pct ?? '15') : base.cdPct,
    note: alert.note ?? '',
    rearm: alert.rearm,
    cooldownMinutes: String(alert.cooldownMinutes ?? 60),
  };
}

type BuiltParams =
  | { ok: true; params: Record<string, unknown> }
  | { ok: false; error: string };

function buildParams(d: Draft): BuiltParams {
  switch (d.type) {
    case 'price_threshold': {
      const threshold = Number(d.ptThreshold);
      if (!(threshold > 0)) return { ok: false, error: 'Enter a price above 0.' };
      return { ok: true, params: { direction: d.ptDirection, threshold } };
    }
    case 'percent_move': {
      const pct = Number(d.pmPct);
      if (!(pct > 0) || pct > 100) return { ok: false, error: 'Enter a percentage between 0 and 100.' };
      return { ok: true, params: { direction: d.pmDirection, pct } };
    }
    case 'week52_breach': {
      const withinPct = Number(d.wkWithinPct || '0');
      if (withinPct < 0 || withinPct > 50) return { ok: false, error: 'Margin must be between 0 and 50%.' };
      return { ok: true, params: withinPct > 0 ? { edge: d.wkEdge, withinPct } : { edge: d.wkEdge } };
    }
    case 'portfolio_pnl': {
      const threshold = Number(d.pnlThreshold);
      if (Number.isNaN(threshold)) return { ok: false, error: 'Enter a threshold value.' };
      return { ok: true, params: { metric: d.pnlMetric, direction: d.pnlDirection, threshold } };
    }
    case 'trailing_stop': {
      const trailPct = Number(d.tsTrailPct);
      if (!(trailPct > 0) || trailPct > 50) return { ok: false, error: 'Enter a trail % between 0 and 50.' };
      return { ok: true, params: { trailPct } };
    }
    case 'cumulative_drawdown': {
      const windowSessions = Number(d.cdWindowSessions);
      const pct = Number(d.cdPct);
      if (!Number.isInteger(windowSessions) || windowSessions < 2 || windowSessions > 20) {
        return { ok: false, error: 'Session window must be a whole number between 2 and 20.' };
      }
      if (!(pct > 0) || pct > 100) return { ok: false, error: 'Enter a percentage between 0 and 100.' };
      return { ok: true, params: { windowSessions, pct } };
    }
    default:
      // IPO alerts are created from the IPO page, not this form.
      return { ok: false, error: 'Unsupported alert type.' };
  }
}

export function AlertForm({ alert, initialSymbol, onClose }: AlertFormProps) {
  const router = useRouter();
  const isEdit = Boolean(alert);
  const [d, setD] = useState<Draft>(() => draftFromAlert(alert, initialSymbol));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setD((prev) => ({ ...prev, [key]: value }));

  const needsSymbol = d.type !== 'portfolio_pnl';
  const symbolOptional = d.type === 'portfolio_pnl';


  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    const built = buildParams(d);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    const params = built.params;
    if (needsSymbol && !d.symbol.trim()) {
      setError('Enter an NSE symbol.');
      return;
    }

    const cooldownMinutes = d.rearm ? Math.max(5, Math.min(1440, Number(d.cooldownMinutes) || 60)) : undefined;

    setSubmitting(true);
    try {
      const url = isEdit ? `/api/alerts/${alert!.id}` : '/api/alerts';
      const method = isEdit ? 'PATCH' : 'POST';
      const body = isEdit
        ? { params, note: d.note.trim() || null, rearm: d.rearm, cooldownMinutes: cooldownMinutes ?? alert!.cooldownMinutes, status: 'active' as const }
        : {
            type: d.type,
            symbol: d.symbol.trim() ? d.symbol.trim().toUpperCase() : null,
            params,
            note: d.note.trim() || undefined,
            rearm: d.rearm,
            cooldownMinutes,
          };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.error ?? 'Could not save that alert.');
        return;
      }
      router.refresh();
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.formGrid}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Type</span>
          <select
            className={styles.select}
            value={d.type}
            disabled={isEdit}
            onChange={(e) => set('type', e.target.value as AlertType)}
          >
            {TYPES.map((t) => (
              <option key={t} value={t}>
                {alertTypeLabel(t)}
              </option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span className={styles.fieldLabel}>
            Symbol{symbolOptional ? ' — blank = whole portfolio' : ''}
          </span>
          <input
            className={styles.input}
            value={d.symbol}
            disabled={isEdit}
            onChange={(e) => set('symbol', e.target.value.toUpperCase())}
            placeholder={needsSymbol ? 'RELIANCE' : 'RELIANCE (optional)'}
          />
        </label>

        {d.type === 'price_threshold' && (
          <>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Condition</span>
              <select className={styles.select} value={d.ptDirection} onChange={(e) => set('ptDirection', e.target.value as Draft['ptDirection'])}>
                <option value="above">Rises to / above</option>
                <option value="below">Falls to / below (stop-loss)</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Price (₹)</span>
              <input className={styles.input} type="number" min="0" step="any" value={d.ptThreshold} onChange={(e) => set('ptThreshold', e.target.value)} placeholder="1400" />
            </label>
          </>
        )}

        {d.type === 'percent_move' && (
          <>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Direction</span>
              <select className={styles.select} value={d.pmDirection} onChange={(e) => set('pmDirection', e.target.value as Draft['pmDirection'])}>
                <option value="up">Up</option>
                <option value="down">Down</option>
                <option value="either">Either way</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Move (% in a day)</span>
              <input className={styles.input} type="number" min="0" max="100" step="any" value={d.pmPct} onChange={(e) => set('pmPct', e.target.value)} />
            </label>
          </>
        )}

        {d.type === 'week52_breach' && (
          <>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Edge</span>
              <select className={styles.select} value={d.wkEdge} onChange={(e) => set('wkEdge', e.target.value as Draft['wkEdge'])}>
                <option value="high">52-week high</option>
                <option value="low">52-week low</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Within margin (%, 0 = exact)</span>
              <input className={styles.input} type="number" min="0" max="50" step="any" value={d.wkWithinPct} onChange={(e) => set('wkWithinPct', e.target.value)} />
            </label>
          </>
        )}

        {d.type === 'trailing_stop' && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Trail (% below peak)</span>
            <input className={styles.input} type="number" min="0" max="50" step="any" value={d.tsTrailPct} onChange={(e) => set('tsTrailPct', e.target.value)} placeholder="10" />
          </label>
        )}

        {d.type === 'cumulative_drawdown' && (
          <>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Session window</span>
              <input className={styles.input} type="number" min="2" max="20" step="1" value={d.cdWindowSessions} onChange={(e) => set('cdWindowSessions', e.target.value)} />
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Drawdown (%)</span>
              <input className={styles.input} type="number" min="0" max="100" step="any" value={d.cdPct} onChange={(e) => set('cdPct', e.target.value)} placeholder="15" />
            </label>
          </>
        )}

        {d.type === 'portfolio_pnl' && (
          <>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Metric</span>
              <select className={styles.select} value={d.pnlMetric} onChange={(e) => set('pnlMetric', e.target.value as Draft['pnlMetric'])}>
                <option value="total_value">Total value</option>
                <option value="unrealized_pnl">Unrealised P&amp;L (₹)</option>
                <option value="unrealized_pnl_pct">Unrealised P&amp;L (%)</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>Condition</span>
              <select className={styles.select} value={d.pnlDirection} onChange={(e) => set('pnlDirection', e.target.value as Draft['pnlDirection'])}>
                <option value="above">Rises above</option>
                <option value="below">Falls below</option>
              </select>
            </label>
            <label className={styles.field}>
              <span className={styles.fieldLabel}>
                Threshold {d.pnlMetric === 'unrealized_pnl_pct' ? '(%)' : '(₹)'}
              </span>
              <input className={styles.input} type="number" step="any" value={d.pnlThreshold} onChange={(e) => set('pnlThreshold', e.target.value)} placeholder={d.pnlMetric === 'unrealized_pnl_pct' ? '15' : '1000000'} />
            </label>
          </>
        )}

        <label className={`${styles.field} ${styles.fieldWide}`}>
          <span className={styles.fieldLabel}>Note (optional)</span>
          <input className={styles.input} value={d.note} maxLength={200} onChange={(e) => set('note', e.target.value)} placeholder="Why you're watching this" />
        </label>

        <label className={styles.checkboxField}>
          <input type="checkbox" checked={d.rearm} onChange={(e) => set('rearm', e.target.checked)} />
          <span>Keep watching after it fires (re-arm)</span>
        </label>

        {d.rearm && (
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Cooldown (minutes)</span>
            <input className={styles.input} type="number" min="5" max="1440" step="1" value={d.cooldownMinutes} onChange={(e) => set('cooldownMinutes', e.target.value)} />
          </label>
        )}
      </div>

      {error && <p className={styles.formError}>{error}</p>}

      <div className={styles.formActions}>
        <button type="button" className={styles.btnSecondary} onClick={onClose}>
          Cancel
        </button>
        <button type="submit" className={styles.btnPrimary} disabled={submitting}>
          {submitting ? 'Saving…' : isEdit ? 'Save changes' : 'Create alert'}
        </button>
      </div>
    </form>
  );
}

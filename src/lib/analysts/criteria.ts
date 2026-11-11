// Thesis invalidation criteria (#130, ADR 0058): observable conditions that would weaken an analyst's baseline thesis, checked each day with
// no AI. The analyst proposes thresholds from a closed set of metrics (so each can be evaluated); deterministic defaults fill any gap. Pure.

import type { StockSignals } from '@/lib/stock/signals';
import type { CriterionMetric, JournalEntry, ThesisCriterion } from './types';

type Unit = '%' | 'x' | ' pts';

interface MetricDef {
  label: string;
  unit: Unit;
  /** The direction that weakens a thesis. */
  op: ThesisCriterion['op'];
  read: (s: StockSignals) => number | null;
  /** Plausible thresholds; anything outside is rejected as a hallucinated figure. */
  min: number;
  max: number;
}

const MIN_HEADLINES = 5;

const METRICS: Record<CriterionMetric, MetricDef> = {
  roce: { label: 'ROCE', unit: '%', op: 'below', read: (s) => s.quality.roce, min: -20, max: 60 },
  roe: { label: 'ROE', unit: '%', op: 'below', read: (s) => s.quality.roe, min: -20, max: 60 },
  debtToEquity: { label: 'Debt to equity', unit: 'x', op: 'above', read: (s) => (s.quality.isFinancial ? null : s.quality.debtToEquity), min: 0, max: 10 },
  promoterHolding: { label: 'Promoter holding', unit: '%', op: 'below', read: (s) => s.ownership.promoter?.pct ?? null, min: 0, max: 100 },
  promoterChange4q: { label: 'Promoter holding change over four quarters', unit: ' pts', op: 'below', read: (s) => s.ownership.promoter?.delta4q ?? null, min: -30, max: 0 },
  qtrSalesYoyPct: { label: 'Latest quarter sales growth (YoY)', unit: '%', op: 'below', read: (s) => s.growth.qtrSalesYoyPct, min: -80, max: 100 },
  qtrProfitYoyPct: { label: 'Latest quarter profit growth (YoY)', unit: '%', op: 'below', read: (s) => s.growth.qtrProfitYoyPct, min: -90, max: 100 },
  negativeNewsPct: { label: 'Share of negative headlines', unit: '%', op: 'above', read: (s) => (s.sentiment.total >= MIN_HEADLINES ? s.sentiment.negativePct : null), min: 10, max: 100 },
};

/** The metrics, in the order defaults are proposed. */
export const CRITERION_METRICS = ['roce', 'roe', 'debtToEquity', 'promoterHolding', 'promoterChange4q', 'qtrSalesYoyPct', 'qtrProfitYoyPct', 'negativeNewsPct'] as const satisfies readonly CriterionMetric[];
export const MAX_CRITERIA = 4;
const MIN_PROPOSED = 2;

export const isMetric = (m: unknown): m is CriterionMetric => typeof m === 'string' && m in METRICS;
export const readMetric = (s: StockSignals, m: CriterionMetric): number | null => METRICS[m].read(s);

const round = (n: number, digits: number): number => Number(n.toFixed(digits));

function fmt(n: number, unit: Unit): string {
  const digits = unit === 'x' ? 2 : 1;
  return `${round(n, digits)}${unit}`;
}

const isPast = (op: ThesisCriterion['op'], value: number, threshold: number): boolean => (op === 'below' ? value < threshold : value > threshold);

/** "ROCE below 10%". */
export function describeCriterion(c: Pick<ThesisCriterion, 'metric' | 'op' | 'threshold'>): string {
  const d = METRICS[c.metric];
  return `${d.label} ${c.op} ${fmt(c.threshold, d.unit)}`;
}

function make(metric: CriterionMetric, threshold: number, signals: StockSignals, source: ThesisCriterion['source'], why: string): ThesisCriterion | null {
  const d = METRICS[metric];
  const baseline = d.read(signals);
  // A metric we cannot read cannot be checked later; one already past its threshold would be a breach on day one, not a trigger.
  if (baseline === null || isPast(d.op, baseline, threshold)) return null;
  return { id: metric, metric, op: d.op, threshold: round(threshold, 2), baseline: round(baseline, 2), why, source, enabled: true, breached: false };
}

/** Deterministic proposals from today's figures: a margin of safety before a condition counts as a break. */
export function defaultCriteria(s: StockSignals): ThesisCriterion[] {
  const roce = s.quality.roce;
  const roe = s.quality.roe;
  const de = METRICS.debtToEquity.read(s);
  const proposals: Array<ThesisCriterion | null> = [
    roce !== null && roce > 0 ? make('roce', Math.max(1, round(roce * 0.7, 1)), s, 'default', '') : null,
    // Banks and insurers have no ROCE; ROE is their measure of capital efficiency.
    roce === null && roe !== null && roe > 0 ? make('roe', Math.max(1, round(roe * 0.7, 1)), s, 'default', '') : null,
    de !== null ? make('debtToEquity', de <= 0.3 ? 0.5 : round(de * 1.5, 2), s, 'default', '') : null,
    make('promoterChange4q', -3, s, 'default', ''),
    make('qtrProfitYoyPct', -25, s, 'default', ''),
    make('qtrSalesYoyPct', -10, s, 'default', ''),
    make('negativeNewsPct', 50, s, 'default', ''),
  ];
  return proposals.filter((p): p is ThesisCriterion => p !== null).slice(0, MAX_CRITERIA);
}

const WHY_MAX = 160;

/** What the model proposed, reduced to valid criteria: a known metric, a plausible threshold, readable today and not already breached. */
export function validateProposed(raw: unknown, s: StockSignals): ThesisCriterion[] {
  if (!Array.isArray(raw)) return [];
  const out = new Map<CriterionMetric, ThesisCriterion>();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const threshold = typeof o.threshold === 'number' ? o.threshold : typeof o.threshold === 'string' ? Number(o.threshold) : NaN;
    if (!isMetric(o.metric) || out.has(o.metric) || !Number.isFinite(threshold)) continue;
    const d = METRICS[o.metric];
    if (threshold < d.min || threshold > d.max) continue;
    const why = typeof o.why === 'string' ? o.why.replace(/\s+/g, ' ').trim().slice(0, WHY_MAX) : '';
    const c = make(o.metric, threshold, s, 'analyst', why);
    if (c) out.set(o.metric, c);
  }
  return [...out.values()].slice(0, MAX_CRITERIA);
}

/** The analyst's own proposals when there are enough, topped up with defaults (one per metric) to reach two to four. */
export function chooseCriteria(proposed: readonly ThesisCriterion[], s: StockSignals): ThesisCriterion[] {
  if (proposed.length >= MIN_PROPOSED) return [...proposed];
  const taken = new Set(proposed.map((c) => c.metric));
  return [...proposed, ...defaultCriteria(s).filter((c) => !taken.has(c.metric))].slice(0, MAX_CRITERIA);
}

export interface Breach {
  criterion: ThesisCriterion;
  value: number;
}

/**
 * Checks every enabled criterion against today's figures. A new breach is reported once; the criterion re-arms when the metric recovers.
 * Returns the updated criteria (never mutates) and the breaches found today.
 */
export function evaluateCriteria(criteria: readonly ThesisCriterion[], s: StockSignals): { criteria: ThesisCriterion[]; breaches: Breach[] } {
  const breaches: Breach[] = [];
  const next = criteria.map((c) => {
    if (!c.enabled) return c;
    const value = METRICS[c.metric].read(s);
    if (value === null) return c;
    const past = isPast(c.op, value, c.threshold);
    if (past && !c.breached) {
      const updated = { ...c, breached: true };
      breaches.push({ criterion: updated, value });
      return updated;
    }
    return !past && c.breached ? { ...c, breached: false } : c;
  });
  return { criteria: next, breaches };
}

/** The objective review written when a criterion is breached: what changed and by how much. Never a recommendation. */
export function breachEntry(b: Breach, symbol: string, now: Date): Omit<JournalEntry, 'id'> {
  const d = METRICS[b.criterion.metric];
  const { baseline, threshold } = b.criterion;
  const since = baseline !== null ? `, from ${fmt(baseline, d.unit)} when the thesis was written (a change of ${round(b.value - baseline, 2)}${d.unit === '%' ? ' pts' : d.unit})` : '';
  return {
    symbol,
    ts: now.toISOString(),
    kind: 'thesis',
    title: `Thesis check: ${describeCriterion(b.criterion)}`,
    body: `${d.label} is ${fmt(b.value, d.unit)} against a limit of ${fmt(threshold, d.unit)}${since}. This is one of the conditions set to review the baseline thesis. It is a point to review the dossier, not a recommendation.`,
    impact: 'negative',
    alert: 'high',
  };
}

export type CriterionAction = 'enable' | 'disable' | 'remove';

/** The criteria after the user switches one on or off or removes it; null when there is no such criterion. Never mutates. */
export function applyCriterionAction(criteria: readonly ThesisCriterion[], id: CriterionMetric, action: CriterionAction): ThesisCriterion[] | null {
  if (!criteria.some((c) => c.id === id)) return null;
  if (action === 'remove') return criteria.filter((c) => c.id !== id);
  return criteria.map((c) => (c.id === id ? { ...c, enabled: action === 'enable' } : c));
}

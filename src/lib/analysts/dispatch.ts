// The morning dispatch (#129, #214, ADR 0058): a free, deterministic roll-up of what every active analyst logged in the last 24 hours.
// No AI call: it only arranges journal entries and dossier summaries that already exist. Pure; the clock is passed in.
// Management by exception: what needs a look comes first (with the holding's portfolio weight), good news second, and
// analysts with nothing material are listed last, collapsed in the UI.

import { istDay } from './caps';
import { clip } from './memo';
import type { AlertLevel, AnalystStatus, Impact, JournalEntry, JournalKind } from './types';

export const DISPATCH_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS_PER_SECTION = 8;
const HIGHLIGHT_CHARS = 140;
const ATTENTION_ALERTS: readonly AlertLevel[] = ['medium', 'high'];
/** Kinds where a negative reading is worth a look even when the heartbeat rated the event low. */
const NEGATIVE_MATTERS: readonly JournalKind[] = ['earnings', 'filing', 'news', 'range'];
/** Plain price and volume logs are routine unless the heartbeat rated them medium or high. */
const ROUTINE_KINDS: readonly JournalKind[] = ['price', 'volume'];

export interface DispatchAnalyst {
  symbol: string;
  status: AnalystStatus;
  summary: string | null;
}

export interface DispatchItem {
  symbol: string;
  kind: JournalKind;
  alert: AlertLevel;
  title: string;
  impact: Impact | null;
  /** Share of the portfolio this holding is, or null for a watcher or when prices were unavailable. */
  weightPct: number | null;
}

export interface QuietLine {
  symbol: string;
  text: string;
}

export interface Dispatch {
  /** The India calendar day it covers. */
  day: string;
  title: string;
  /** Two or three plain sentences: how many need a look, which one first, how many are quiet. */
  pulse: string;
  /** Medium or high alerts, thesis breaches and negative readings: material risks and anomalies. */
  attention: DispatchItem[];
  /** Positive or neutral developments: results, 52-week highs, filings, news. */
  catalysts: DispatchItem[];
  /** Active analysts with nothing material, one line each. */
  quiet: QuietLine[];
  analystCount: number;
}

/** The shape saved before #214. Kept so older stored briefs still open. */
export interface LegacyDispatch {
  day: string;
  title: string;
  priority: Array<Pick<DispatchItem, 'symbol' | 'kind' | 'alert' | 'title'>>;
  developments: Array<Pick<DispatchItem, 'symbol' | 'kind' | 'alert' | 'title'>>;
  highlights: QuietLine[];
  analystCount: number;
}

/** The analysts write "Routine ..." on entries they themselves consider no news; honour that over the alert level. */
const ROUTINE_TITLE = /^\s*routine\b/i;

type Bucket = 'attention' | 'catalyst' | 'routine';

function classify(e: JournalEntry): Bucket {
  if (e.kind === 'thesis') return 'attention';
  if (ROUTINE_TITLE.test(e.title)) return 'routine';
  if (ATTENTION_ALERTS.includes(e.alert)) return e.impact === 'positive' ? 'catalyst' : 'attention';
  if (e.impact === 'negative' && NEGATIVE_MATTERS.includes(e.kind)) return 'attention';
  return ROUTINE_KINDS.includes(e.kind) ? 'routine' : 'catalyst';
}

const rank: Record<AlertLevel, number> = { high: 0, medium: 1, low: 2 };
const weightOf = (i: DispatchItem): number => i.weightPct ?? -1;

const toItem = (e: JournalEntry, weights: Readonly<Record<string, number>>): DispatchItem => ({ symbol: e.symbol, kind: e.kind, alert: e.alert, title: e.title, impact: e.impact, weightPct: weights[e.symbol] ?? null });
const byUrgency = (a: DispatchItem, b: DispatchItem): number => rank[a.alert] - rank[b.alert] || weightOf(b) - weightOf(a);

/** The first sentence of a dossier summary, clipped: a one-line reminder of the thesis. */
function highlight(summary: string): string {
  const first = summary.split(/(?<=[.!?])\s/)[0] ?? summary;
  return clip(first, HIGHLIGHT_CHARS);
}

const symbolsOf = (items: readonly DispatchItem[]): Set<string> => new Set(items.map((i) => i.symbol));
const weightLabel = (i: Pick<DispatchItem, 'weightPct'>): string => (i.weightPct === null ? '' : ` (${i.weightPct}%)`);

/** The pulse sentences. Pure, so the same words come out in the app, the bell and the email. */
export function buildPulse(attention: readonly DispatchItem[], catalysts: readonly DispatchItem[], quietCount: number, analystCount: number): string {
  const needs = symbolsOf(attention).size;
  const good = [...symbolsOf(catalysts)].filter((s) => !symbolsOf(attention).has(s)).length;
  const parts = [needs > 0 ? `${needs} of your ${analystCount} analysts ${needs === 1 ? 'needs' : 'need'} attention today.` : 'Nothing needs attention today.'];
  const top = attention[0];
  if (top) parts.push(`Start with ${top.symbol}${top.weightPct === null ? '' : ` (${top.weightPct}% of your portfolio)`}: ${top.title}.`);
  if (good > 0) parts.push(`${good} ${good === 1 ? 'has' : 'have'} a positive or neutral development.`);
  if (quietCount > 0) parts.push(`${quietCount} logged nothing material.`);
  return parts.join(' ');
}

/**
 * The dispatch for one user, or null when there is nothing to send: no active analyst, or nothing material in the window
 * (routine price and volume logs and dossier highlights alone never justify an email). `weights` maps a symbol to its
 * share of the portfolio in percent; leave it empty when quotes are unavailable.
 */
export function buildDispatch(analysts: readonly DispatchAnalyst[], entries: readonly JournalEntry[], now: Date, weights: Readonly<Record<string, number>> = {}): Dispatch | null {
  const active = analysts.filter((a) => a.status === 'active');
  if (active.length === 0) return null;
  const activeSymbols = new Set(active.map((a) => a.symbol));
  const since = now.getTime() - DISPATCH_WINDOW_MS;
  const recent = entries
    .filter((e) => e.kind !== 'initiation' && activeSymbols.has(e.symbol) && new Date(e.ts).getTime() >= since && new Date(e.ts).getTime() <= now.getTime())
    .sort((a, b) => b.ts.localeCompare(a.ts));
  const all = recent.map((e) => ({ bucket: classify(e), item: toItem(e, weights) }));
  const attentionAll = all.filter((x) => x.bucket === 'attention').map((x) => x.item).sort(byUrgency);
  const catalystAll = all.filter((x) => x.bucket === 'catalyst').map((x) => x.item).sort(byUrgency);
  if (attentionAll.length === 0 && catalystAll.length === 0) return null;
  const attention = attentionAll.slice(0, MAX_ITEMS_PER_SECTION);
  const catalysts = catalystAll.slice(0, MAX_ITEMS_PER_SECTION);
  const loud = new Set([...symbolsOf(attentionAll), ...symbolsOf(catalystAll)]);
  const quiet = active.filter((a) => !loud.has(a.symbol)).map((a) => ({ symbol: a.symbol, text: a.summary ? highlight(a.summary) : '' }));
  const n = attention.length;
  const title = n > 0 ? `Morning brief: ${n} ${n === 1 ? 'item needs' : 'items need'} a look` : 'Morning brief: overnight developments on your holdings';
  return { day: istDay(now), title, pulse: buildPulse(attentionAll, catalystAll, quiet.length, active.length), attention, catalysts, quiet, analystCount: active.length };
}

const ROUND = 10;

/** Each holding's share of the portfolio in percent, from quantity x latest price. Holdings with no usable price are left out. */
export function portfolioWeights(holdings: ReadonlyArray<{ symbol: string; quantity: number }>, prices: Readonly<Record<string, number>>): Record<string, number> {
  const values = new Map<string, number>();
  for (const h of holdings) {
    const price = prices[h.symbol];
    if (!Number.isFinite(price) || !(price > 0) || !(h.quantity > 0)) continue;
    values.set(h.symbol, (values.get(h.symbol) ?? 0) + h.quantity * price);
  }
  const total = [...values.values()].reduce((s, v) => s + v, 0);
  if (total <= 0) return {};
  return Object.fromEntries([...values].map(([symbol, v]) => [symbol, Math.round((v / total) * 100 * ROUND) / ROUND]));
}

const isLegacy = (d: Dispatch | LegacyDispatch): d is LegacyDispatch => !('attention' in d);
const legacyItem = (i: LegacyDispatch['priority'][number]): DispatchItem => ({ ...i, impact: null, weightPct: null });

/** Brings a stored brief up to the current shape. A current brief is returned as is. */
export function upgradeDispatch(d: Dispatch | LegacyDispatch): Dispatch {
  if (!isLegacy(d)) return d;
  const attention = d.priority.map(legacyItem);
  const catalysts = d.developments.map(legacyItem);
  return { day: d.day, title: d.title, pulse: buildPulse(attention, catalysts, d.highlights.length, d.analystCount), attention, catalysts, quiet: d.highlights, analystCount: d.analystCount };
}

const line = (i: DispatchItem): string => `- ${i.symbol}${weightLabel(i)}: ${i.title}`;

/** Plain text for the in-app record and the email body. The pulse comes first so the bell preview shows it. */
export function renderDispatchText(d: Dispatch): string {
  const parts: string[] = [d.pulse, ''];
  if (d.attention.length) parts.push('Requires attention', ...d.attention.map(line), '');
  if (d.catalysts.length) parts.push('Catalysts and tailwinds', ...d.catalysts.map(line), '');
  if (d.quiet.length) parts.push(`Quiet holdings (${d.quiet.length}): ${d.quiet.map((q) => q.symbol).join(', ')}`, '');
  parts.push(`From ${d.analystCount} ${d.analystCount === 1 ? 'analyst' : 'analysts'}, built from public data. Not investment advice.`);
  return parts.join('\n');
}

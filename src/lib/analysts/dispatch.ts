// The morning dispatch (#129, ADR 0058): a free, deterministic roll-up of what every active analyst logged in the last 24 hours.
// No AI call: it only arranges journal entries and dossier summaries that already exist. Pure; the clock is passed in.

import { istDay } from './caps';
import { clip } from './memo';
import type { AlertLevel, AnalystStatus, JournalEntry, JournalKind } from './types';

export const DISPATCH_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_ITEMS_PER_SECTION = 8;
const HIGHLIGHT_CHARS = 140;
const PRIORITY_KINDS: readonly JournalKind[] = ['earnings', 'range'];
const PRIORITY_ALERTS: readonly AlertLevel[] = ['medium', 'high'];

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
}

export interface Dispatch {
  /** The India calendar day it covers. */
  day: string;
  title: string;
  /** Earnings, 52-week highs and lows, and anything the analyst rated medium or high. */
  priority: DispatchItem[];
  /** Everything else logged overnight for a holding: news, filings, smaller moves. */
  developments: DispatchItem[];
  /** One line per active analyst with a dossier. */
  highlights: Array<{ symbol: string; text: string }>;
  analystCount: number;
}

const isPriority = (e: JournalEntry): boolean => PRIORITY_KINDS.includes(e.kind) || PRIORITY_ALERTS.includes(e.alert);
const rank: Record<AlertLevel, number> = { high: 0, medium: 1, low: 2 };

const toItem = (e: JournalEntry): DispatchItem => ({ symbol: e.symbol, kind: e.kind, alert: e.alert, title: e.title });
const byUrgency = (a: JournalEntry, b: JournalEntry): number => rank[a.alert] - rank[b.alert] || b.ts.localeCompare(a.ts);

/** The first sentence of a dossier summary, clipped: a one-line reminder of the thesis. */
function highlight(summary: string): string {
  const first = summary.split(/(?<=[.!?])\s/)[0] ?? summary;
  return clip(first, HIGHLIGHT_CHARS);
}

/**
 * The dispatch for one user, or null when there is nothing to send: no active analyst, or nothing material in the window
 * (dossier highlights alone never justify an email).
 */
export function buildDispatch(analysts: readonly DispatchAnalyst[], entries: readonly JournalEntry[], now: Date): Dispatch | null {
  const active = analysts.filter((a) => a.status === 'active');
  if (active.length === 0) return null;
  const activeSymbols = new Set(active.map((a) => a.symbol));
  const since = now.getTime() - DISPATCH_WINDOW_MS;
  const recent = entries.filter((e) => e.kind !== 'initiation' && activeSymbols.has(e.symbol) && new Date(e.ts).getTime() >= since && new Date(e.ts).getTime() <= now.getTime());
  const priority = recent.filter(isPriority).sort(byUrgency).slice(0, MAX_ITEMS_PER_SECTION).map(toItem);
  const developments = recent.filter((e) => !isPriority(e)).sort(byUrgency).slice(0, MAX_ITEMS_PER_SECTION).map(toItem);
  if (priority.length === 0 && developments.length === 0) return null;
  const highlights = active.flatMap((a) => (a.summary ? [{ symbol: a.symbol, text: highlight(a.summary) }] : []));
  const day = istDay(now);
  const n = priority.length;
  const title = n > 0 ? `Morning brief: ${n} ${n === 1 ? 'item needs' : 'items need'} a look` : 'Morning brief: overnight developments on your holdings';
  return { day, title, priority, developments, highlights, analystCount: active.length };
}

const line = (i: DispatchItem): string => `- ${i.symbol}: ${i.title}`;

/** Plain text for the in-app record and the email body. */
export function renderDispatchText(d: Dispatch): string {
  const parts: string[] = [];
  if (d.priority.length) parts.push('Priority', ...d.priority.map(line), '');
  if (d.developments.length) parts.push('Overnight developments', ...d.developments.map(line), '');
  if (d.highlights.length) parts.push('Where each analyst stands', ...d.highlights.map((h) => `- ${h.symbol}: ${h.text}`), '');
  parts.push(`From ${d.analystCount} ${d.analystCount === 1 ? 'analyst' : 'analysts'}, built from public data. Not investment advice.`);
  return parts.join('\n');
}

// Pure helpers for the Analyst Desk UI (#133): which analysts need attention, where a pending dossier is in the queue, the Root Agent's
// summary, and the roster filters. Nothing here calls an AI; the clock is passed in so it tests without mocks.

import type { AlertLevel, AnalystSource, AnalystStatus, JournalEntry } from './types';

export interface RosterQuote {
  price: number;
  changePct: number | null;
}

export interface RosterAnalyst {
  symbol: string;
  source: AnalystSource;
  status: AnalystStatus;
  statusNote: string | null;
  hasDossier: boolean;
  summary: string | null;
  createdAt: string;
  lastCheckedAt: string | null;
  latest: JournalEntry | null;
  /** Journal entries about events (the initiation entry is not an event). */
  eventCount: number;
  quote: RosterQuote | null;
}

export interface DeskData {
  auto: boolean;
  usage: { used: number; cap: number };
  analysts: RosterAnalyst[];
}

export type DeskFilter = 'all' | 'attention' | 'vigilant' | 'waiting';
export const DESK_FILTERS: readonly DeskFilter[] = ['all', 'attention', 'vigilant', 'waiting'];

const ATTENTION_WINDOW_MS = 48 * 60 * 60 * 1000;
const ATTENTION_LEVELS: readonly AlertLevel[] = ['medium', 'high'];

/** Why an analyst needs a look, or null. A medium or high alert in the last 48 hours, or an analyst in error. */
export function attentionReason(a: RosterAnalyst, now: Date): string | null {
  if (isStalled(a)) return 'Dossier stalled. Retry it from its card.';
  if (a.status === 'error') return a.statusNote ?? 'The analyst hit an error.';
  const e = a.latest;
  if (e && ATTENTION_LEVELS.includes(e.alert) && now.getTime() - new Date(e.ts).getTime() <= ATTENTION_WINDOW_MS) return e.title;
  return null;
}

export const needsAttention = (a: RosterAnalyst, now: Date): boolean => attentionReason(a, now) !== null;

export type QueueState =
  | { kind: 'needs_key' }
  | { kind: 'cap_reached' }
  | { kind: 'queued'; ahead: number }
  /** Behind the day's remaining AI budget: it cannot be built before tomorrow's budget opens. */
  | { kind: 'tomorrow' }
  /** Automatic analysts are off, so nothing is queued. The user builds this dossier from the card. */
  | { kind: 'manual' }
  | null;

/**
 * What an analyst without a dossier is honestly waiting for. No percentages: the build is one AI call and we do not know when it will
 * run, only that analysts are built oldest first (roster order), a few per scheduled run, and not at all once the day's cap is spent.
 */
export function queueState(a: RosterAnalyst, all: readonly RosterAnalyst[], usage: { used: number; cap: number }, auto = true): QueueState {
  if (a.status !== 'initializing') return null;
  if (/AI key/i.test(a.statusNote ?? '')) return { kind: 'needs_key' };
  if (usage.used >= usage.cap) return { kind: 'cap_reached' };
  // With the schedule off there is no queue: the user picks a card and builds that dossier.
  if (!auto) return { kind: 'manual' };
  // The roster arrives oldest first, so the position in it is the queue position even when several analysts were created in the same instant.
  const waiting = all.filter((o) => o.status === 'initializing' && !/AI key/i.test(o.statusNote ?? ''));
  const ahead = Math.max(0, waiting.findIndex((o) => o.symbol === a.symbol));
  // Each build is one AI call, so only as many analysts as there are calls left in today's budget can finish today.
  return ahead >= usage.cap - usage.used ? { kind: 'tomorrow' } : { kind: 'queued', ahead };
}

export function queueLabel(q: QueueState): string | null {
  if (!q) return null;
  switch (q.kind) {
    case 'needs_key':
      return 'Waiting for an AI key';
    case 'cap_reached':
      return 'Daily AI cap reached, resumes tomorrow';
    case 'tomorrow':
      return 'Scheduled for tomorrow (daily AI budget)';
    case 'queued':
      return q.ahead === 0 ? 'Queued, next up' : `Queued, ${q.ahead} ahead`;
    case 'manual':
      return 'Not scheduled';
  }
}

/** How many waiting analysts cannot be built today because the day's AI budget is smaller than the queue. */
export function tomorrowCount(all: readonly RosterAnalyst[], usage: { used: number; cap: number }, auto = true): number {
  if (!auto) return 0;
  return all.filter((a) => {
    const q = queueState(a, all, usage);
    return q?.kind === 'tomorrow' || q?.kind === 'cap_reached';
  }).length;
}

/** The user can build this analyst's dossier right now: it is waiting (with a key) or its build failed. A paused analyst can be built only when the schedule is off, because that click is the user's choice. */
export function canAnalyzeNow(a: RosterAnalyst, auto = true): boolean {
  if (a.hasDossier) return false;
  if (/AI key/i.test(a.statusNote ?? '')) return false;
  if (a.status === 'error' || a.status === 'initializing') return true;
  return !auto && a.status === 'paused';
}

/** An analyst whose dossier build failed (as opposed to one whose later check failed). */
export const isStalled = (a: RosterAnalyst): boolean => a.status === 'error' && !a.hasDossier;

export const stalledCount = (list: readonly RosterAnalyst[]): number => list.filter(isStalled).length;

export type PrimaryAction =
  | { kind: 'dossier'; label: 'View dossier' }
  | { kind: 'retry'; label: 'Retry' }
  | { kind: 'analyze'; label: 'Analyze now' | 'Generate dossier' }
  | { kind: 'key'; label: 'Add AI key' }
  | { kind: 'resume'; label: 'Resume' };

/**
 * The one button a card leads with, by state: read the dossier when there is one, otherwise the step that moves it forward. A stalled analyst
 * gets Retry (never Resume beside it), a waiting one Analyze now, one without a key a link to Settings. When automatic analysts are off,
 * a card without a dossier leads with Generate dossier so the user chooses which one to build (#194).
 */
export function primaryAction(a: RosterAnalyst, auto = true): PrimaryAction {
  if (a.hasDossier) return { kind: 'dossier', label: 'View dossier' };
  if (isStalled(a)) return { kind: 'retry', label: 'Retry' };
  if (/AI key/i.test(a.statusNote ?? '')) return { kind: 'key', label: 'Add AI key' };
  if (!auto) return { kind: 'analyze', label: 'Generate dossier' };
  if (a.status === 'paused') return { kind: 'resume', label: 'Resume' };
  return { kind: 'analyze', label: 'Analyze now' };
}

export type MenuAction = { id: 'pause' | 'resume' | 'remove'; label: string; danger?: boolean };

/** The management actions tucked into the card's ⋯ menu. Resume only when it is the way back (paused, or a built analyst in error). */
export function menuActions(a: RosterAnalyst): MenuAction[] {
  const items: MenuAction[] = [];
  if (a.status === 'paused' || (a.status === 'error' && a.hasDossier)) items.push({ id: 'resume', label: 'Resume' });
  else if (!isStalled(a)) items.push({ id: 'pause', label: 'Pause' });
  if (a.source === 'watcher') items.push({ id: 'remove', label: 'Remove watcher', danger: true });
  return items;
}

export function matchesFilter(a: RosterAnalyst, filter: DeskFilter, now: Date): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'attention':
      return needsAttention(a, now);
    case 'vigilant':
      return a.status === 'active' && !needsAttention(a, now);
    case 'waiting':
      return a.status === 'initializing';
  }
}

export const filterAnalysts = (list: readonly RosterAnalyst[], filter: DeskFilter, now: Date): RosterAnalyst[] => list.filter((a) => matchesFilter(a, filter, now));

export function filterCounts(list: readonly RosterAnalyst[], now: Date): Record<DeskFilter, number> {
  return {
    all: list.length,
    attention: filterAnalysts(list, 'attention', now).length,
    vigilant: filterAnalysts(list, 'vigilant', now).length,
    waiting: filterAnalysts(list, 'waiting', now).length,
  };
}

export interface DeskSummary {
  total: number;
  vigilant: number;
  attention: Array<{ symbol: string; reason: string }>;
  waiting: number;
  paused: number;
  /** Analysts whose dossier build failed, so the deck can offer Retry all. */
  stalled: number;
  /** The most recent journal entry across the desk, if any. */
  latest: { symbol: string; title: string; ts: string } | null;
}

/** The Root Agent's read of the desk, built from the roster alone. */
export function summarizeDesk(list: readonly RosterAnalyst[], now: Date): DeskSummary {
  const attention = list.flatMap((a) => {
    const reason = attentionReason(a, now);
    return reason ? [{ symbol: a.symbol, reason }] : [];
  });
  const newest = list
    .flatMap((a) => (a.latest ? [{ symbol: a.symbol, title: a.latest.title, ts: a.latest.ts }] : []))
    .sort((x, y) => new Date(y.ts).getTime() - new Date(x.ts).getTime())[0];
  return {
    total: list.length,
    vigilant: filterAnalysts(list, 'vigilant', now).length,
    attention,
    waiting: list.filter((a) => a.status === 'initializing').length,
    paused: list.filter((a) => a.status === 'paused').length,
    stalled: stalledCount(list),
    latest: newest ?? null,
  };
}

/** One plain sentence describing the desk, for the Root Agent deck. */
export function deskHeadline(s: DeskSummary): string {
  if (s.total === 0) return 'No analysts yet.';
  const parts = [`${s.vigilant} vigilant`];
  if (s.attention.length > 0) parts.push(`${s.attention.length} need${s.attention.length === 1 ? 's' : ''} attention`);
  if (s.waiting > 0) parts.push(`${s.waiting} building`);
  if (s.paused > 0) parts.push(`${s.paused} paused`);
  return `${s.total} ${s.total === 1 ? 'analyst' : 'analysts'}: ${parts.join(', ')}.`;
}

// What the Alerts page shows and how it groups, filters and words each alert. Pure: "now" is passed in.

import type { Alert } from '@/lib/alerts/types';
import { formatInr } from '@/lib/dashboard/format';
import { describeAlert, relativeTime } from './alertText';

export type AlertTab = 'active' | 'triggered' | 'paused' | 'all';
export type AlertGroupKey = 'stop' | 'target' | 'moves' | 'portfolio' | 'ipo';

export const TAB_LABEL: Record<AlertTab, string> = { active: 'Active', triggered: 'Triggered', paused: 'Paused', all: 'All' };
export const GROUP_LABEL: Record<AlertGroupKey, string> = {
  stop: 'Stop-loss',
  target: 'Price target',
  moves: 'Moves & 52-week',
  portfolio: 'Portfolio',
  ipo: 'IPO',
};
export const GROUP_ORDER: readonly AlertGroupKey[] = ['stop', 'target', 'moves', 'portfolio', 'ipo'];

/** A triggered alert stays "needs attention" this long; after that it reads as resolved. */
export const ATTENTION_DAYS = 7;
const DAY_MS = 86_400_000;

/** Stop-loss covers a price floor, a trailing stop and a drawdown watch: all three protect against a fall. */
export function alertGroup(alert: Pick<Alert, 'type' | 'params'>): AlertGroupKey {
  switch (alert.type) {
    case 'price_threshold':
      return (alert.params as { direction?: string }).direction === 'below' ? 'stop' : 'target';
    case 'trailing_stop':
    case 'cumulative_drawdown':
      return 'stop';
    case 'percent_move':
    case 'week52_breach':
      return 'moves';
    case 'portfolio_pnl':
      return 'portfolio';
    case 'ipo':
    case 'ipo_watch':
      return 'ipo';
  }
}

export function tabCounts(alerts: readonly Pick<Alert, 'status'>[]): Record<AlertTab, number> {
  const counts: Record<AlertTab, number> = { active: 0, triggered: 0, paused: 0, all: alerts.length };
  for (const a of alerts) counts[a.status] += 1;
  return counts;
}

/** Opens on Active when something is being watched, otherwise on whatever has content, so the page is never an empty tab. */
export function defaultTab(counts: Record<AlertTab, number>): AlertTab {
  if (counts.active > 0) return 'active';
  if (counts.triggered > 0) return 'triggered';
  if (counts.paused > 0) return 'paused';
  return 'all';
}

/** Tabs worth showing: those with alerts, plus the active one and All. */
export function visibleTabs(counts: Record<AlertTab, number>, current: AlertTab): AlertTab[] {
  return (['active', 'triggered', 'paused', 'all'] as const).filter((t) => t === 'all' || t === current || counts[t] > 0);
}

export interface AlertQuery {
  readonly tab: AlertTab;
  readonly group: AlertGroupKey | 'all';
  readonly text: string;
}

export function matchesText(alert: Alert, text: string): boolean {
  const q = text.trim().toLowerCase();
  if (!q) return true;
  return [alert.symbol ?? '', alert.note ?? '', describeAlert(alert)].some((s) => s.toLowerCase().includes(q));
}

export function filterAlerts(alerts: readonly Alert[], { tab, group, text }: AlertQuery): Alert[] {
  return alerts.filter((a) => (tab === 'all' || a.status === tab) && (group === 'all' || alertGroup(a) === group) && matchesText(a, text));
}

const time = (d: Date | string | null): number => (d ? new Date(d).getTime() : 0);

export function isRecentlyTriggered(alert: Pick<Alert, 'status' | 'triggeredAt'>, now: Date): boolean {
  return alert.status === 'triggered' && now.getTime() - time(alert.triggeredAt) <= ATTENTION_DAYS * DAY_MS;
}

export interface AlertSections {
  /** Triggered within the last week, newest first. */
  readonly attention: Alert[];
  /** Being watched. */
  readonly monitoring: Alert[];
  readonly paused: Alert[];
  /** Triggered longer ago: history, not alarms. */
  readonly resolved: Alert[];
}

export function splitSections(alerts: readonly Alert[], now: Date): AlertSections {
  const byTriggeredDesc = (a: Alert, b: Alert) => time(b.triggeredAt) - time(a.triggeredAt);
  const triggered = alerts.filter((a) => a.status === 'triggered').sort(byTriggeredDesc);
  return {
    attention: triggered.filter((a) => isRecentlyTriggered(a, now)),
    resolved: triggered.filter((a) => !isRecentlyTriggered(a, now)),
    monitoring: alerts.filter((a) => a.status === 'active'),
    paused: alerts.filter((a) => a.status === 'paused'),
  };
}

/** A short title with the condition in it: "TCS: Stop-loss below ₹2,300.00". */
export function alertTitle(alert: Alert): string {
  if (alert.type === 'price_threshold' && alert.symbol) {
    const p = alert.params as { direction: 'above' | 'below'; threshold: number };
    return `${alert.symbol}: ${p.direction === 'below' ? 'Stop-loss below' : 'Price target above'} ${formatInr(p.threshold)}`;
  }
  return describeAlert(alert);
}

const PRICE_VALUED = new Set<Alert['type']>(['price_threshold', 'trailing_stop']);

export interface AlertFact {
  readonly label: string;
  readonly value: string;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
const IST_DATE = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'numeric', year: 'numeric' });

/** "07 Sep 2026" in India time, with fixed month names (locale data spells September differently across runtimes). */
function dateText(d: Date | string): string {
  const parts = Object.fromEntries(IST_DATE.formatToParts(new Date(d)).map((p) => [p.type, p.value]));
  return `${parts.day} ${MONTHS[Number(parts.month) - 1]} ${parts.year}`;
}

/** The supporting numbers for a row: the value it hit (or last saw), and when it triggered (or was last checked). */
export function alertFacts(alert: Alert): AlertFact[] {
  const facts: AlertFact[] = [];
  if (alert.lastObservedValue !== null) {
    const v = alert.lastObservedValue;
    const value = PRICE_VALUED.has(alert.type) ? formatInr(v) : v.toLocaleString('en-IN', { maximumFractionDigits: 2 });
    facts.push({ label: alert.status === 'triggered' ? 'Hit at' : 'Last value', value });
  }
  if (alert.status === 'triggered' && alert.triggeredAt) {
    facts.push({ label: 'Triggered', value: dateText(alert.triggeredAt) });
  } else {
    facts.push({ label: 'Last checked', value: alert.lastEvaluatedAt ? relativeTime(alert.lastEvaluatedAt) : 'not yet' });
  }
  return facts;
}

/** The one-line banner under the header. */
export function guardrailBanner(enabled: boolean): { readonly text: string; readonly on: boolean } {
  return enabled
    ? { on: true, text: 'Auto-guardrails active: 10% trailing stop and 15% drawdown watch on new holdings.' }
    : { on: false, text: 'Auto-guardrails are off: new holdings get no default stop or drawdown alert.' };
}

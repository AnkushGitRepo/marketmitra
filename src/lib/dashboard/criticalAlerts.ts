import { tagsForActivity } from './activityTags';

export type AlertSeverity = 'critical' | 'warning';

export interface AlertLike {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
  readonly read: boolean;
  readonly createdAt: Date | string;
  readonly meta: Record<string, unknown>;
}

const WINDOW_DAYS = 7;
const DAY_MS = 86_400_000;

/**
 * Stop-loss and drawdown alerts are critical (red). A price alert that fired on a fall is critical too; everything else
 * (price targets reached, big up-moves, 52-week events) is a warning (amber), so the colour tracks risk, not just "an alert".
 */
export function alertSeverity(item: AlertLike): AlertSeverity {
  const tags = tagsForActivity(item);
  if (tags.includes('STOP-LOSS') || tags.includes('DRAWDOWN')) return 'critical';
  if (tags.includes('PRICE TARGET') || tags.includes('BIG MOVE') || tags.includes('52-WEEK')) {
    return /\b(fell|down|below|drop|lower|low)\b/i.test(item.title) ? 'critical' : 'warning';
  }
  return 'warning';
}

const time = (d: Date | string) => new Date(d).getTime();

/** Triggered alerts from the last week, unread first then newest, at most `limit`. System notices are not alerts. */
export function selectCriticalAlerts<T extends AlertLike>(items: readonly T[], now: Date, limit = 3): T[] {
  const cutoff = now.getTime() - WINDOW_DAYS * DAY_MS;
  return items
    .filter((n) => n.kind === 'alert' && time(n.createdAt) >= cutoff)
    .sort((a, b) => Number(a.read) - Number(b.read) || time(b.createdAt) - time(a.createdAt))
    .slice(0, limit);
}

import { loadScreenData } from '../screen/fetch';
import { deliverNotification, resolveChannels } from '@/lib/notifications/deliver';
import { evaluateKill, killKey } from './killMonitor';
import { appendFiring, listMonitoredEntries } from './store';
import type { JournalEntry } from './types';

export interface ReviewSummary {
  entriesChecked: number;
  criteriaChecked: number;
  fired: Array<{ symbol: string; description: string }>;
  unknown: number;
  errors: string[];
}

/** Check every monitored recommendation's kill criteria against fresh data and
 * notify — once per criterion — only when one has fired. Quiet otherwise. */
export async function runKillReview(asOf: string, userId?: string): Promise<ReviewSummary> {
  const entries: Array<JournalEntry & { userId: string }> = await listMonitoredEntries(userId);
  const summary: ReviewSummary = { entriesChecked: 0, criteriaChecked: 0, fired: [], unknown: 0, errors: [] };

  const bySymbol = new Map<string, Awaited<ReturnType<typeof loadScreenData>>>();
  for (const entry of entries) {
    if (!bySymbol.has(entry.symbol)) bySymbol.set(entry.symbol, await loadScreenData(entry.symbol, asOf));
    const loaded = bySymbol.get(entry.symbol)!;
    if (!loaded.ok) {
      summary.errors.push(`${entry.symbol}: ${loaded.error}`);
      continue;
    }
    summary.entriesChecked += 1;
    const already = new Set(entry.killFired.map((f) => f.key));

    for (const rule of entry.killCriteria) {
      summary.criteriaChecked += 1;
      const key = killKey(rule);
      if (already.has(key)) continue;
      const check = evaluateKill(rule, loaded.data);
      if (check.status === 'unknown') {
        summary.unknown += 1;
        continue;
      }
      if (check.status !== 'fired') continue;

      const firing = { key, description: rule.description, at: new Date().toISOString(), observed: check.observed };
      // Record first: a delivery failure must never cause a repeat notification.
      await appendFiring(entry.id, firing);
      already.add(key);
      summary.fired.push({ symbol: entry.symbol, description: rule.description });
      await deliverNotification(
        entry.userId,
        {
          kind: 'alert',
          title: `Thesis check: ${entry.symbol}`,
          body: `A kill criterion you set for ${entry.name} has fired — ${rule.description}. Observed: ${check.observed.map((v) => (v === null ? 'n/a' : Number(v.toFixed(2)))).join(', ')}. Review your thesis; nothing has been sold.`,
          href: '/advisor/journal',
          meta: { advisor: true, journalId: entry.id, symbol: entry.symbol, key },
        },
        await resolveChannels(entry.userId).catch(() => ({})),
      ).catch((err: unknown) => summary.errors.push(`notify ${entry.symbol}: ${String(err)}`));
    }
  }
  return summary;
}

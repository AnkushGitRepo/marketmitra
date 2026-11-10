import { advisorPageUser } from '@/lib/advisor/pageGuard';
import { listEntries } from '@/lib/advisor/journal/store';
import { getQuotes } from '@/lib/dashboard/fundamentalsApi';
import { JournalClient } from '@/components/advisor/JournalClient';

export const dynamic = 'force-dynamic';

export default async function AdvisorJournalPage() {
  const userId = await advisorPageUser();
  if (!userId) return null;
  const entries = await listEntries(userId).catch(() => []);
  const symbols = [...new Set(entries.filter((e) => e.kind === 'stock').map((e) => e.symbol))];
  const quotes = symbols.length ? await getQuotes(symbols).catch(() => []) : [];
  const prices: Record<string, number> = {};
  for (const q of quotes) {
    const p = q.price ? Number(q.price) : NaN;
    if (Number.isFinite(p)) prices[q.symbol.toUpperCase()] = p;
  }
  return <JournalClient entries={entries} prices={prices} />;
}

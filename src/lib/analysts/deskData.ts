// Builds the Analyst Desk roster for the /agents page and GET /api/analysts (#133), so the two cannot drift apart.

import { getQuotes } from '@/lib/dashboard/quotes';
import { getPreferences } from '@/lib/preferences/store';
import { DAILY_AI_CAP } from './caps';
import type { DeskData, RosterQuote } from './desk';
import { countEvents, getUsage, latestEntries, listAnalysts } from './store';

/** Live prices are a nicety: if the quote source is down the cards simply show no price. */
async function quotesBySymbol(symbols: readonly string[]): Promise<Record<string, RosterQuote>> {
  if (symbols.length === 0) return {};
  try {
    const quotes = await getQuotes([...symbols]);
    return Object.fromEntries(quotes.map((q) => [q.symbol.toUpperCase(), { price: q.price, changePct: Number.isFinite(q.changePct) ? q.changePct : null }]));
  } catch {
    return {};
  }
}

export async function loadDeskData(userId: string): Promise<DeskData> {
  const records = await listAnalysts(userId);
  const symbols = records.map((r) => r.symbol);
  const [latest, counts, usage, prefs, quotes] = await Promise.all([latestEntries(userId, symbols), countEvents(userId, symbols), getUsage(userId), getPreferences(userId), quotesBySymbol(symbols)]);
  return {
    auto: prefs.agents.auto,
    usage: { used: usage.count, cap: DAILY_AI_CAP },
    analysts: records.map((r) => ({
      symbol: r.symbol,
      source: r.source,
      status: r.status,
      statusNote: r.statusNote,
      hasDossier: r.dossier !== null,
      summary: r.dossier?.summary ?? null,
      createdAt: r.createdAt.toISOString(),
      lastCheckedAt: r.lastCheckedAt?.toISOString() ?? null,
      latest: latest[r.symbol] ?? null,
      eventCount: counts[r.symbol] ?? 0,
      quote: quotes[r.symbol] ?? null,
    })),
  };
}

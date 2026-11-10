import { formatChatContext, mergeNews } from '@/lib/ai/chatContext';
import { getEnrichedHoldings } from '@/lib/dashboard/enrichedHoldings';
import { getNews } from '@/lib/dashboard/newsApi';

/**
 * A small always-present seed for chat prompts: the portfolio summary plus a few
 * headlines. The model reaches for `search_context` / the data tools for anything
 * beyond this.
 */
export async function buildPortfolioContext(userId: string): Promise<string> {
  const holdings = await getEnrichedHoldings(userId).catch(() => []);
  const symbols = holdings.map((h) => h.symbol);
  const [specific, broad] = await Promise.all([
    symbols.length ? getNews({ symbols, limit: 6 }) : Promise.resolve({ items: [], next_cursor: null }),
    getNews({ limit: 4 }),
  ]);
  return formatChatContext(holdings, mergeNews(specific.items, broad.items));
}

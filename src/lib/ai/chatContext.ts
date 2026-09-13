// Builds the plain-text context block the Mitra chat (ADR 0018 pt.5) hands
// to the model: a portfolio summary + per-holding lines + recent news.
// Pure and string-only so it can be unit-tested without network — the
// route (`/api/ai/chat`) fetches the holdings/news and calls these.

import type { EnrichedHolding } from '@/lib/dashboard/enrichedHoldings';
import type { NewsItem } from '@/lib/dashboard/newsApi';
import type { PageContextValue } from '@/lib/dashboard/pageContextTypes';

const MAX_NEWS = 10;

const PAGE_LABELS: Record<PageContextValue['page'], string> = {
  dashboard: 'the dashboard home',
  portfolio: 'the portfolio page',
  markets: 'the markets page',
  stock: 'a stock detail page',
  index: 'an index detail page',
};

/** One line describing where the user currently is, for the system prompt
 * (ADR 0022) — lets Mitra resolve "this stock"/"what you're looking at"
 * and gives `open_stock` a default ticker when the user doesn't name one. */
export function formatPageContext(ctx: PageContextValue | null): string {
  if (!ctx) return 'The user is somewhere in the app; exact page unknown.';
  let line = `The user is currently on ${PAGE_LABELS[ctx.page]}`;
  if (ctx.page === 'stock' && ctx.ticker) {
    line += ` for ${ctx.ticker}`;
    if (ctx.range) line += `, viewing the ${ctx.range} price chart`;
  }
  if (ctx.page === 'index' && ctx.name) {
    line += ` for ${ctx.name}`;
    if (ctx.range) line += `, viewing the ${ctx.range} price chart`;
  }
  return `${line}.`;
}

function inr(n: number): string {
  return `₹${Math.round(n).toLocaleString('en-IN')}`;
}

/** Newest-first, de-duplicated by URL, capped. */
export function mergeNews(...pages: NewsItem[][]): NewsItem[] {
  const seen = new Set<string>();
  const out: NewsItem[] = [];
  for (const page of pages) {
    for (const item of page) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      out.push(item);
    }
  }
  return out
    .sort((a, b) => (a.published_at < b.published_at ? 1 : -1))
    .slice(0, MAX_NEWS);
}

export function formatChatContext(holdings: EnrichedHolding[], news: NewsItem[]): string {
  const lines: string[] = [];

  if (holdings.length === 0) {
    lines.push('Portfolio: no holdings added yet.');
  } else {
    const priced = holdings.filter((h) => h.ltp !== null);
    const value = priced.reduce((sum, h) => sum + h.quantity * (h.ltp as number), 0);
    const invested = holdings.reduce((sum, h) => sum + h.quantity * h.avgPrice, 0);
    lines.push(
      `Portfolio: ${holdings.length} holding(s), invested ${inr(invested)}, ` +
        `current value ${inr(value)} (${priced.length} with a live price).`
    );
    for (const h of holdings) {
      const base = `- ${h.name} (${h.symbol})${h.sector ? `, ${h.sector}` : ''}: ` +
        `${h.quantity} @ avg ₹${h.avgPrice}`;
      if (h.ltp === null) {
        lines.push(`${base}, no live price`);
      } else {
        const pl = h.quantity * (h.ltp - h.avgPrice);
        lines.push(`${base}, LTP ₹${h.ltp}, unrealised P&L ${pl >= 0 ? '+' : '-'}${inr(Math.abs(pl))}`);
      }
    }
  }

  if (news.length > 0) {
    lines.push('', 'Recent news headlines (sentiment is an automated tone label, not a market call):');
    for (const n of news) {
      lines.push(`- [${n.sentiment}] ${n.title} — ${n.source}, ${n.published_at.slice(0, 10)}`);
    }
  }

  return lines.join('\n');
}

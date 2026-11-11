// Gathers the public data a stock insight or brief is written from (shared by /api/insights/stock and /api/insights/stock-brief).

import { getCompany, getFinancials, getPrices, getRatios, getShareholding } from '@/lib/dashboard/fundamentalsApi';
import { getNews } from '@/lib/dashboard/newsApi';
import { retrieveInsightGrounding } from '@/lib/rag/insightContext';
import type { StockInsightInput } from './insightPrompts';

/** The stock's prompt input, or null when the company itself could not be loaded. */
export async function gatherStockInput(symbol: string, userId: string): Promise<StockInsightInput | null> {
  const [company, ratios, pl, shareholding, prices, news] = await Promise.all([
    getCompany(symbol),
    getRatios(symbol),
    getFinancials(symbol, 'profit_and_loss'),
    getShareholding(symbol),
    getPrices(symbol, '1mo'),
    getNews({ symbols: [symbol], limit: 5 }),
  ]);

  if (!company) return null;

  // Pivot P&L: last two periods for a handful of headline labels.
  const labels = ['Sales', 'Net Profit', 'Operating Profit', 'EPS', 'Revenue', 'Profit before tax'];
  const byLabel = new Map<string, { period_end: string; value: string | null }[]>();
  for (const item of pl ?? []) {
    if (!byLabel.has(item.label)) byLabel.set(item.label, []);
    byLabel.get(item.label)!.push({ period_end: item.period_end, value: item.value });
  }
  const financialsSummary = labels
    .filter((l) => byLabel.has(l))
    .map((l) => {
      const rows = byLabel.get(l)!.sort((a, b) => b.period_end.localeCompare(a.period_end));
      return { label: l, latest: rows[0]?.value ?? null, prior: rows[1]?.value ?? null };
    });

  const closes = (prices ?? []).filter((p) => p.close !== null).map((p) => Number(p.close));

  const shByCat = new Map<string, string>();
  for (const s of (shareholding ?? []).sort((a, b) => b.quarter_end.localeCompare(a.quarter_end))) {
    if (!shByCat.has(s.category)) shByCat.set(s.category, s.percentage);
  }

  const grounding = await retrieveInsightGrounding({
    query: `${company.name} ${symbol} results valuation outlook risks recent developments`,
    userId,
    symbol,
    docTypes: ['news', 'filing'],
    limit: 6,
  });

  return {
    symbol,
    company: {
      name: company.name,
      sector: company.sector,
      industry: company.industry,
      about: company.about ? company.about.slice(0, 800) : null,
    },
    ratios: (ratios ?? []).slice(0, 14).map((r) => ({ name: r.name, value: r.value, unit: r.unit })),
    latestClose: closes[0] ?? null,
    financialsSummary,
    shareholdingLatest: [...shByCat].map(([category, percentage]) => ({ category, percentage })),
    news: news.items.map((n) => ({ title: n.title, sentiment: n.sentiment, published_at: n.published_at })),
    grounding: grounding.passages,
  };
}

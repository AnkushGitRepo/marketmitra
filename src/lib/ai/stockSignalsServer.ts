// Fetches the raw data for a stock and turns it into StockSignals (#115). Used by the brief route; the stock page does the same
// from data it has already loaded.

import { toBars } from '@/lib/chart/bars';
import { getCompany, getFinancials, getPeers, getPrices, getQuotes, getRatios, getShareholding } from '@/lib/dashboard/fundamentalsApi';
import { getNews } from '@/lib/dashboard/newsApi';
import { resolveRange52 } from '@/lib/stock/range52';
import { buildSignals, type StockSignals } from '@/lib/stock/signals';
import type { BriefContext } from './stockBrief';

const NEWS_LIMIT = 10;

export interface SignalBundle {
  context: BriefContext;
  signals: StockSignals;
}

/** Null when the company itself cannot be loaded. Everything else degrades to "not available". */
export async function loadSignalBundle(symbol: string): Promise<SignalBundle | null> {
  const [company, ratios, peers, pl, bs, cf, shareholding, news, prices, quotes] = await Promise.all([
    getCompany(symbol),
    getRatios(symbol),
    getPeers(symbol),
    getFinancials(symbol, 'profit_and_loss'),
    getFinancials(symbol, 'balance_sheet'),
    getFinancials(symbol, 'cash_flow'),
    getShareholding(symbol),
    getNews({ symbols: [symbol], limit: NEWS_LIMIT }),
    getPrices(symbol, '5y'),
    getQuotes([symbol]).catch(() => []),
  ]);
  if (!company) return null;

  const bars = toBars(prices ?? []);
  const quote = quotes[0] ?? null;
  const livePrice = quote?.price != null ? Number(quote.price) : null;
  const lastClose = bars.length ? bars[bars.length - 1].close : null;
  const price = livePrice ?? lastClose;

  const signals = buildSignals({
    sector: company.sector,
    industry: company.industry,
    ratios: ratios ?? [],
    peers: peers ?? [],
    price,
    bars,
    range52: resolveRange52({ low: quote?.week52_low ?? null, high: quote?.week52_high ?? null }, bars),
    profitAndLoss: pl ?? [],
    balanceSheet: bs ?? [],
    cashFlow: cf ?? [],
    shareholding: shareholding ?? [],
    news: news.items,
  });

  return {
    context: {
      symbol,
      company: { name: company.name, sector: company.sector, industry: company.industry, about: null },
      latestClose: price,
      news: news.items.map((n) => ({ title: n.title, sentiment: n.sentiment, published_at: n.published_at })),
    },
    signals,
  };
}

import type { Metadata } from 'next';
import {
  getCompany,
  getDocuments,
  getFinancials,
  getPeers,
  getPrices,
  getQuotes,
  getRatios,
  getShareholding,
} from '@/lib/dashboard/fundamentalsApi';
import { getNews } from '@/lib/dashboard/newsApi';
import { getCurrentUserId } from '@/lib/currentUserId';
import { DataUnavailable } from '@/components/common/DataUnavailable';
import { getUserAiConfig, resolveHasAiKey } from '@/lib/ai/userAiConfig';
import { getCachedInsight } from '@/lib/insights';
import { pivotFinancials, groupShareholding } from '@/lib/dashboard/transforms';
import { toBars } from '@/lib/chart/bars';
import { StockPageClient, type HeaderQuote } from './StockPageClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();
  const company = await getCompany(symbol);
  if (!company) return { title: symbol };
  return {
    title: `${company.name} (${symbol})`,
    description: `${company.name} — ratios, financials, shareholding, peers, and price history for ${symbol} on the NSE.${company.sector ? ` Sector: ${company.sector}.` : ''}`,
  };
}

export default async function StockPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();

  // Resolved first (cheap: a header/JWT read, no network) so the MongoDB-backed
  // AI-card lookups below can run in the same round as the data fetches instead
  // of after them — they were an extra sequential hop on the critical path.
  const userId = await getCurrentUserId();
  const aiState = Promise.all([
    userId ? resolveHasAiKey(getUserAiConfig(userId)) : Promise.resolve(false),
    userId ? getCachedInsight('stock', symbol, userId).catch(() => null) : Promise.resolve(null),
  ]);

  const [company, ratios, shareholding, peers, documents, news, pl, bs, cf, fiveYearPrices, [hasKey, cachedInsight]] =
    await Promise.all([
      getCompany(symbol),
      getRatios(symbol),
      getShareholding(symbol),
      getPeers(symbol),
      getDocuments(symbol),
      getNews({ symbols: [symbol], limit: 6 }),
      getFinancials(symbol, 'profit_and_loss'),
      getFinancials(symbol, 'balance_sheet'),
      getFinancials(symbol, 'cash_flow'),
      // One 5-year fetch backs the chart (every range tab) and the latest/previous close.
      getPrices(symbol, '5y'),
      aiState,
    ]);

  if (!company) {
    return (
      <div className={styles.pageRoot}>
        <DataUnavailable>
          Couldn&rsquo;t load data for &ldquo;{symbol}&rdquo; — the data service may be temporarily offline, or
          this isn&rsquo;t a symbol it recognizes. Your portfolio and alerts are unaffected.
        </DataUnavailable>
      </div>
    );
  }

  const aiInsight = {
    hasKey,
    initial: cachedInsight
      ? { content: cachedInsight.content, generatedAt: cachedInsight.generatedAt.toISOString() }
      : null,
  };

  // The 5-year daily set backs every range tab; the chart windows into it.
  const bars = toBars(fiveYearPrices ?? []);

  // /prices returns newest-first (see fundamentals-api's get_price_history).
  const recentCloses = (fiveYearPrices ?? []).filter((p) => p.close !== null);
  const latestPrice = recentCloses[0] ?? null;
  const previousPrice = recentCloses[1] ?? null;

  // A live quote (ADR 0024) takes priority over yesterday's close — falling
  // back to the EOD close only when a live price wasn't available at all,
  // so the header never shows nothing. It is deliberately NOT awaited: the
  // live Yahoo call is the slowest thing on this page, so the page streams
  // first and the header price fills in when it resolves (Suspense + `use`).
  const quote: Promise<HeaderQuote> = getQuotes([symbol])
    .catch(() => [])
    .then((quotes) => {
      const live = quotes[0] ?? null;
      return {
        latestClose: live?.price ?? latestPrice?.close ?? null,
        previousClose: live?.prev_close ?? previousPrice?.close ?? null,
        week52High: live?.week52_high ?? null,
        week52Low: live?.week52_low ?? null,
      };
    });

  return (
    <StockPageClient
      symbol={symbol}
      company={company}
      ratios={ratios ?? []}
      peers={peers ?? []}
      documents={documents ?? []}
      shareholding={groupShareholding(shareholding ?? [])}
      news={news.items}
      aiInsight={aiInsight}
      financials={{
        profit_and_loss: pivotFinancials(pl ?? [], 'profit_and_loss'),
        balance_sheet: pivotFinancials(bs ?? [], 'balance_sheet'),
        cash_flow: pivotFinancials(cf ?? [], 'cash_flow'),
      }}
      bars={bars}
      quote={quote}
    />
  );
}

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
  type PricePeriod,
} from '@/lib/dashboard/fundamentalsApi';
import { getNews } from '@/lib/dashboard/newsApi';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getUserAiConfig, resolveHasAiKey } from '@/lib/ai/userAiConfig';
import { getCachedInsight } from '@/lib/insights';
import { pivotFinancials, toRangeSeries, groupShareholding } from '@/lib/dashboard/transforms';
import { StockPageClient } from './StockPageClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const PRICE_PERIODS: PricePeriod[] = ['1mo', '6mo', '1y', '5y'];

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

  const [company, ratios, shareholding, peers, documents, news, pl, bs, cf, quotes, ...priceSets] =
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
      getQuotes([symbol]),
      ...PRICE_PERIODS.map((p) => getPrices(symbol, p)),
    ]);

  if (!company) {
    return (
      <div className={styles.pageRoot}>
        <p className={styles.meta}>
          Couldn&rsquo;t load data for &ldquo;{symbol}&rdquo; — the fundamentals service may be offline, or
          this isn&rsquo;t a symbol it recognizes.
        </p>
      </div>
    );
  }

  const userId = await getCurrentUserId();
  const [hasKey, cachedInsight] = await Promise.all([
    userId ? resolveHasAiKey(getUserAiConfig(userId)) : Promise.resolve(false),
    userId ? getCachedInsight('stock', symbol, userId).catch(() => null) : null,
  ]);
  const aiInsight = {
    hasKey,
    initial: cachedInsight
      ? { content: cachedInsight.content, generatedAt: cachedInsight.generatedAt.toISOString() }
      : null,
  };

  const priceSeries = Object.fromEntries(
    PRICE_PERIODS.map((period, i) => [period, toRangeSeries(priceSets[i] ?? [], period)])
  ) as Record<PricePeriod, ReturnType<typeof toRangeSeries>>;

  // /prices returns newest-first (see fundamentals-api's get_price_history).
  const recentCloses = (priceSets[0] ?? []).filter((p) => p.close !== null);
  const latestPrice = recentCloses[0] ?? null;
  const previousPrice = recentCloses[1] ?? null;

  // A live quote (ADR 0024) takes priority over yesterday's close — falling
  // back to the EOD close only when a live price wasn't available at all,
  // so the header never shows nothing.
  const liveQuote = quotes[0] ?? null;
  const displayClose = liveQuote?.price ?? latestPrice?.close ?? null;
  const displayPreviousClose = liveQuote?.prev_close ?? previousPrice?.close ?? null;

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
      priceSeries={priceSeries}
      latestClose={displayClose}
      previousClose={displayPreviousClose}
    />
  );
}

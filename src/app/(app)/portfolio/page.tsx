import type { Metadata } from 'next';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getEnrichedHoldings } from '@/lib/dashboard/enrichedHoldings';
import { getPortfolioValueHistories } from '@/lib/dashboard/portfolioHistory';
import { fetchIndexHistory } from '@/lib/dashboard/yahooQuote';
import { slicePricesByPeriod } from '@/lib/dashboard/pricePeriods';
import { alignToDates } from '@/lib/portfolio/compare';
import type { PricePeriod } from '@/lib/dashboard/fundamentalsApi';
import { getPrices } from '@/lib/dashboard/fundamentalsApi';
import { listPurchaseDates } from '@/lib/tax/dates';
import { peakSincePurchase, type PeakSincePurchase } from '@/lib/portfolio/peak';
import { getNews } from '@/lib/dashboard/newsApi';
import { RISK_PROFILES } from '@/lib/onboarding/profiles';
import { getPreferences } from '@/lib/preferences/store';
import { PortfolioPageClient } from './PortfolioPageClient';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Portfolio',
  description: 'Your holdings, live value, allocation, and unrealised P&L.',
};

export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  const userId = await getCurrentUserId();

  if (!userId) {
    return (
      <div className={styles.pageRoot}>
        <p className={styles.chartSub}>Sign in to see your portfolio.</p>
      </div>
    );
  }

  const [holdings, prefs] = await Promise.all([getEnrichedHoldings(userId), getPreferences(userId)]);
  const profile = prefs.onboarding.riskProfile;
  const positions = holdings.map((h) => ({ symbol: h.symbol, quantity: h.quantity }));

  const [historyByPeriod, niftyHistory] = await Promise.all([getPortfolioValueHistories(positions), fetchIndexHistory('NIFTY 50', '5y')]);
  // Nifty 50 closes lined up with each range's dates, so the chart compares like with like (null = no data, the overlay hides).
  const benchmark = Object.fromEntries(
    (Object.keys(historyByPeriod) as PricePeriod[]).map((period) => {
      const dates = historyByPeriod[period].d ?? [];
      const closes = slicePricesByPeriod(niftyHistory, period).flatMap((p) => (p.close === null ? [] : [{ date: p.trade_date, close: Number(p.close) }]));
      return [period, closes.length > 1 ? alignToDates(dates, closes) : []];
    })
  ) as Record<PricePeriod, (number | null)[]>;

  // Peak since purchase: only for holdings with a purchase date, from real daily closes (the same 5y fetch the value
  // chart makes, so it is served from the fetch cache). A failed lookup just leaves that holding without a peak.
  const purchaseDates = await listPurchaseDates(userId).catch(() => ({}) as Record<string, string>);
  const peakEntries = await Promise.all(
    holdings.map(async (h) => {
      const date = purchaseDates[h.id];
      if (!date) return null;
      return [h.id, peakSincePurchase(await getPrices(h.symbol, '5y'), date, h.ltp)] as const;
    })
  );
  const peaks = Object.fromEntries(peakEntries.filter((e): e is readonly [string, PeakSincePurchase] => e !== null && e[1] !== null));

  // News scoped to the holdings actually in this portfolio — same
  // `/api/news`-backing `getNews()` the News page's "My holdings" filter
  // uses, just always on here since this whole page is holdings-scoped.
  const holdingSymbols = [...new Set(holdings.map((h) => h.symbol.toUpperCase()))];
  const news = holdingSymbols.length > 0 ? await getNews({ symbols: holdingSymbols, limit: 8 }) : null;

  return (
    <PortfolioPageClient
      holdings={holdings}
      history={historyByPeriod}
      benchmark={benchmark}
      peaks={peaks}
      news={news?.items ?? []}
      maxPositionPct={profile ? RISK_PROFILES[profile].maxPositionPct : null}
    />
  );
}

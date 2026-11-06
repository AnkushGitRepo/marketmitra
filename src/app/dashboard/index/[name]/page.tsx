import type { Metadata } from 'next';
import { getQuotes, type PricePeriod } from '@/lib/dashboard/fundamentalsApi';
import { getNews } from '@/lib/dashboard/newsApi';
import { fetchIndexHistory, isTrackedIndexName } from '@/lib/dashboard/yahooQuote';
import { toCandleSeries, toRangeSeries } from '@/lib/dashboard/transforms';
import { slicePricesByPeriod } from '@/lib/dashboard/pricePeriods';
import type { CandlePoint } from '@/lib/dashboard/chartMath';
import { IndexPageClient } from './IndexPageClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const PRICE_PERIODS: PricePeriod[] = ['1mo', '6mo', '1y', '5y'];

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}): Promise<Metadata> {
  const { name: rawName } = await params;
  const name = decodeURIComponent(rawName).toUpperCase();
  return {
    title: name,
    description: `${name} — live value, day change, and price history.`,
  };
}

export default async function IndexPage({ params }: { params: Promise<{ name: string }> }) {
  const { name: rawName } = await params;
  const name = decodeURIComponent(rawName).trim().toUpperCase();

  if (!isTrackedIndexName(name)) {
    return (
      <div className={styles.pageRoot}>
        <p className={styles.meta}>
          &ldquo;{name}&rdquo; isn&rsquo;t a tracked index. MarketMitra currently tracks NIFTY 50, SENSEX,
          NIFTY BANK, and INDIA VIX.
        </p>
      </div>
    );
  }

  // One 5-year fetch, sliced per range tab, instead of four Yahoo calls.
  const [quotes, news, fiveYear] = await Promise.all([
    getQuotes([name]),
    getNews({ limit: 6 }),
    fetchIndexHistory(name, '5y'),
  ]);
  const priceSets = PRICE_PERIODS.map((p) => slicePricesByPeriod(fiveYear, p));

  const quote = quotes[0] ?? null;

  const priceSeries = Object.fromEntries(
    PRICE_PERIODS.map((period, i) => [period, toRangeSeries(priceSets[i] ?? [], period)])
  ) as Record<PricePeriod, ReturnType<typeof toRangeSeries>>;

  const candleSeries = Object.fromEntries(
    PRICE_PERIODS.map((period, i) => [period, toCandleSeries(priceSets[i] ?? [], period)])
  ) as Record<PricePeriod, CandlePoint[]>;

  return (
    <IndexPageClient
      name={name}
      value={quote?.price ?? null}
      prevClose={quote?.prev_close ?? null}
      changePct={quote?.change_pct ?? null}
      week52High={quote?.week52_high ?? null}
      week52Low={quote?.week52_low ?? null}
      asOf={quote?.as_of ?? null}
      priceSeries={priceSeries}
      candleSeries={candleSeries}
      news={news.items}
    />
  );
}

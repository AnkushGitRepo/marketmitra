import type { Metadata } from 'next';
import { getQuotes, type PricePeriod } from '@/lib/dashboard/fundamentalsApi';
import { getNews } from '@/lib/dashboard/newsApi';
import { fetchIndexHistory, isTrackedIndexName } from '@/lib/dashboard/yahooQuote';
import { toRangeSeries } from '@/lib/dashboard/transforms';
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

  const [quotes, news, ...priceSets] = await Promise.all([
    getQuotes([name]),
    getNews({ limit: 6 }),
    ...PRICE_PERIODS.map((p) => fetchIndexHistory(name, p)),
  ]);

  const quote = quotes[0] ?? null;

  const priceSeries = Object.fromEntries(
    PRICE_PERIODS.map((period, i) => [period, toRangeSeries(priceSets[i] ?? [], period)])
  ) as Record<PricePeriod, ReturnType<typeof toRangeSeries>>;

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
      news={news.items}
    />
  );
}

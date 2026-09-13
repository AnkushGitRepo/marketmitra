'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LineChart } from '@/components/dashboard-charts/LineChart';
import { PillTabs } from '@/components/dashboard-charts/PillTabs';
import { NewsList } from '@/components/dashboard-charts/NewsList';
import { usePageContext } from '@/lib/dashboard/PageContext';
import type { PricePeriod } from '@/lib/dashboard/fundamentalsApi';
import type { NewsItem } from '@/lib/dashboard/newsApi';
import type { RangeSeries } from '@/lib/dashboard/chartMath';
import styles from './page.module.css';

const RANGE_OPTIONS: PricePeriod[] = ['1mo', '6mo', '1y', '5y'];
const RANGE_LABELS: Record<PricePeriod, string> = { '1mo': '1M', '6mo': '6M', '1y': '1Y', '5y': '5Y' };

interface IndexPageClientProps {
  name: string;
  value: string | null;
  prevClose: string | null;
  changePct: string | null;
  week52High: string | null;
  week52Low: string | null;
  asOf: string | null;
  priceSeries: Record<PricePeriod, RangeSeries>;
  news: NewsItem[];
}

function formatValue(n: number): string {
  return n.toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

export function IndexPageClient({
  name,
  value,
  prevClose,
  changePct,
  week52High,
  week52Low,
  asOf,
  priceSeries,
  news,
}: IndexPageClientProps) {
  const router = useRouter();
  const { setPageContext } = usePageContext();
  const [range, setRange] = useState<PricePeriod>('1y');

  useEffect(() => {
    setPageContext({ page: 'index', name, range });
    return () => setPageContext(null);
  }, [name, range, setPageContext]);

  const current = value !== null ? Number(value) : null;
  const prev = prevClose !== null ? Number(prevClose) : null;
  const change = current !== null && prev !== null ? current - prev : null;
  const pct = changePct !== null ? Number(changePct) : null;
  const up = (change ?? 0) >= 0;

  return (
    <div className={styles.pageRoot}>
      <button type="button" className={styles.backButton} onClick={() => router.back()}>
        ← Back
      </button>

      <div className={styles.headRow}>
        <div>
          <p className={styles.badge}>Index</p>
          <h1 className={styles.h1}>{name}</h1>
          {asOf && <p className={styles.meta}>As of {new Date(asOf).toLocaleString('en-IN')}</p>}
        </div>
        <div className={styles.priceCol}>
          <p className={styles.price}>{current !== null ? formatValue(current) : '—'}</p>
          {change !== null && pct !== null && (
            <p className={styles.priceChg} style={{ color: up ? 'var(--app-gain)' : 'var(--app-loss)' }}>
              {up ? '+' : ''}
              {change.toFixed(2)} ({up ? '+' : ''}
              {pct.toFixed(2)}%)
            </p>
          )}
        </div>
      </div>

      {(week52High !== null || week52Low !== null) && (
        <div className={`${styles.cardPad} ${styles.aboutCard}`}>
          <div className={styles.statsRow}>
            <div className={styles.stat}>
              <p className={styles.statLabel}>52-week high</p>
              <p className={styles.statValue}>{week52High !== null ? formatValue(Number(week52High)) : '—'}</p>
            </div>
            <div className={styles.stat}>
              <p className={styles.statLabel}>52-week low</p>
              <p className={styles.statValue}>{week52Low !== null ? formatValue(Number(week52Low)) : '—'}</p>
            </div>
          </div>
        </div>
      )}

      <div className={styles.card}>
        <div className={styles.cardHead}>
          <p className={styles.cardLabel}>Price history</p>
          <PillTabs options={RANGE_OPTIONS} value={range} onChange={setRange} labels={RANGE_LABELS} />
        </div>
        {priceSeries[range].v.length > 0 ? (
          <LineChart
            series={priceSeries[range]}
            height={210}
            formatValue={formatValue}
            ariaLabel={`${name} price chart, ${RANGE_LABELS[range]}`}
          />
        ) : (
          <p className={styles.meta}>No price history available for this range.</p>
        )}
      </div>

      {news.length > 0 && (
        <div className={`${styles.cardPad} ${styles.aboutCard}`}>
          <p className={styles.cardLabel} style={{ marginBottom: 6 }}>
            Market news
          </p>
          <p className={styles.newsCaveat}>General Indian-markets news — not specific to {name}.</p>
          <NewsList items={news} emptyText="No recent market news." />
        </div>
      )}
    </div>
  );
}

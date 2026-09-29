'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LineChart } from '@/components/dashboard-charts/LineChart';
import { PillTabs } from '@/components/dashboard-charts/PillTabs';
import { IndexCard } from '@/components/dashboard-charts/IndexCard';
import { MoverPanel } from '@/components/dashboard-charts/MoverPanel';
import { IpoOpenCard } from '@/components/dashboard-charts/IpoOpenCard';
import { ActivityCard } from '@/components/dashboard-charts/ActivityCard';
import { useMask } from '@/lib/dashboard/MaskContext';
import { formatInr } from '@/lib/dashboard/format';
import type { IndexQuoteOut, PricePeriod } from '@/lib/dashboard/fundamentalsApi';
import type { Ipo } from '@/lib/dashboard/iposApi';
import type { Quote } from '@/lib/dashboard/quotes';
import type { EnrichedHolding } from '@/lib/dashboard/enrichedHoldings';
import type { RangeSeries } from '@/lib/dashboard/chartMath';
import type { Notification } from '@/lib/notifications/types';
import styles from './page.module.css';

const RANGE_OPTIONS: PricePeriod[] = ['1mo', '6mo', '1y', '5y'];
const RANGE_LABELS: Record<PricePeriod, string> = { '1mo': '1M', '6mo': '6M', '1y': '1Y', '5y': '5Y' };

interface DashboardPageClientProps {
  holdings: EnrichedHolding[];
  history: Record<PricePeriod, RangeSeries>;
  indices: IndexQuoteOut[];
  gainers: Quote[];
  losers: Quote[];
  openIpos: Ipo[];
  activity: Notification[];
}

export function DashboardPageClient({
  holdings,
  history,
  indices,
  gainers,
  losers,
  openIpos,
  activity,
}: DashboardPageClientProps) {
  const router = useRouter();
  const { masked } = useMask();
  const [range, setRange] = useState<PricePeriod>('1y');

  const priced = holdings.filter((h) => h.ltp !== null);
  const totalValue = priced.reduce((sum, h) => sum + h.quantity * h.ltp!, 0);
  const invested = holdings.reduce((sum, h) => sum + h.quantity * h.avgPrice, 0);
  const totalPL = totalValue - invested;
  const todayChange = priced.reduce((sum, h) => sum + h.quantity * (h.dayChange ?? 0), 0);

  return (
    <div className={styles.pageRoot}>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>Live data</p>
          <h1 className={styles.h1}>Dashboard</h1>
        </div>
        <div className={styles.headActions}>
          <button type="button" className={styles.btnSecondary} onClick={() => router.push('/dashboard/portfolio')}>
            Manage holdings
          </button>
        </div>
      </div>

      {holdings.length === 0 ? (
        <div className={styles.emptyPortfolioCard}>
          <p className={styles.emptyTitle}>No holdings yet</p>
          <p className={styles.statSub}>
            Add a position on the Portfolio page to see live value and P&amp;L here.
          </p>
          <button type="button" className={styles.btnPrimary} onClick={() => router.push('/dashboard/portfolio')}>
            Go to Portfolio
          </button>
        </div>
      ) : (
        <>
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <div className={styles.statHead}>
                <p className={styles.statLabel}>Portfolio value</p>
                <span className={`${styles.statChip} ${invested ? (totalPL >= 0 ? styles.chipPositive : styles.chipNegative) : styles.chipNeutral}`}>
                  {invested ? `${totalPL >= 0 ? '+' : ''}${((totalPL / invested) * 100).toFixed(1)}%` : '—'}
                </span>
              </div>
              <p className={styles.statValue}>{formatInr(totalValue, 0, masked)}</p>
              <p className={styles.statSub}>Invested {formatInr(invested, 0, masked)}</p>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statHead}>
                <p className={styles.statLabel}>Today&rsquo;s change</p>
                <span className={`${styles.statChip} ${styles.chipNeutral}`}>Live</span>
              </div>
              <p className={styles.statValue}>
                {todayChange >= 0 ? '+' : ''}
                {formatInr(todayChange, 0, masked)}
              </p>
              <p className={styles.statSub}>Across {priced.length} priced holding{priced.length === 1 ? '' : 's'}</p>
            </div>
            <div className={styles.statCard}>
              <div className={styles.statHead}>
                <p className={styles.statLabel}>Total gain / loss</p>
              </div>
              <p className={styles.statValue}>
                {totalPL >= 0 ? '+' : ''}
                {formatInr(totalPL, 0, masked)}
              </p>
              <p className={styles.statSub}>Since purchase, at current price</p>
            </div>
          </div>

          <div className={styles.chartCard}>
            <div className={styles.chartHead}>
              <div>
                <p className={styles.chartLabel}>Portfolio performance</p>
                <p className={styles.chartValue}>{formatInr(totalValue, 0, masked)}</p>
              </div>
              <PillTabs options={RANGE_OPTIONS} value={range} onChange={setRange} labels={RANGE_LABELS} />
            </div>
            {history[range].v.length > 0 ? (
              <LineChart
                series={history[range]}
                height={230}
                formatValue={(v) => formatInr(v, 0, masked)}
                ariaLabel={`Portfolio value chart, ${RANGE_LABELS[range]}`}
              />
            ) : (
              <p className={styles.statSub}>Not enough price history yet for this range.</p>
            )}
          </div>
        </>
      )}

      <div className={styles.sectionHead}>
        <h2 className={styles.h2}>Today&rsquo;s market</h2>
        <button type="button" className={styles.openMarketsLink} onClick={() => router.push('/dashboard/markets')}>
          Open Markets →
        </button>
      </div>

      <div className={styles.indexGrid}>
        {indices.map((ix) => (
          <IndexCard key={ix.name} index={ix} />
        ))}
        {indices.length === 0 && <p className={styles.statSub}>Index data is temporarily unavailable.</p>}
      </div>

      <div className={styles.moverGrid}>
        <MoverPanel title="Top gainers (watchlist)" rows={gainers} />
        <MoverPanel title="Top losers (watchlist)" rows={losers} />
      </div>

      <IpoOpenCard openIpos={openIpos} />

      <ActivityCard items={activity} />
    </div>
  );
}

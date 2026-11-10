'use client';

import { useState } from 'react';
import { LineChart } from '@/components/dashboard-charts/LineChart';
import { PillTabs } from '@/components/dashboard-charts/PillTabs';
import { ReturnBadge } from '@/components/dashboard-charts/ReturnBadge';
import { formatInr } from '@/lib/dashboard/format';
import { computeHero } from '@/lib/dashboard/heroMetrics';
import type { RangeSeries } from '@/lib/dashboard/chartMath';
import type { PricePeriod } from '@/lib/dashboard/fundamentalsApi';
import type { PortfolioTotals } from '@/lib/portfolio/portfolioMetrics';
import styles from './PortfolioHero.module.css';

const RANGE_OPTIONS: readonly PricePeriod[] = ['1mo', '6mo', '1y', '5y'];
const RANGE_LABELS: Record<PricePeriod, string> = { '1mo': '1M', '6mo': '6M', '1y': '1Y', '5y': '5Y' };

interface PortfolioHeroProps {
  readonly totals: PortfolioTotals;
  readonly history: Record<PricePeriod, RangeSeries>;
  readonly masked: boolean;
}

/** Value, invested, total return and today's change side by side, with the performance chart directly below. */
export function PortfolioHero({ totals, history, masked }: PortfolioHeroProps) {
  const [range, setRange] = useState<PricePeriod>('1y');
  const metrics = computeHero(totals);
  const series = history[range];

  return (
    <section className={styles.card} aria-label="Portfolio summary">
      <div className={styles.head}>
        <div className={styles.kpis}>
          <div>
            <p className={styles.label}>Current value</p>
            <p className={styles.value}>{formatInr(totals.totalValue, 0, masked)}</p>
          </div>
          <div>
            <p className={styles.label}>Invested</p>
            <p className={styles.invested}>{formatInr(totals.invested, 0, masked)}</p>
          </div>
          <div className={styles.badges}>
            <ReturnBadge label="Total return" figure={metrics.total} masked={masked} />
            <ReturnBadge label="Today" figure={metrics.today} masked={masked} live />
          </div>
        </div>
        <div className={styles.tabs}>
          <PillTabs options={RANGE_OPTIONS} value={range} onChange={setRange} labels={RANGE_LABELS} />
        </div>
      </div>

      {series.v.length > 1 ? (
        <LineChart
          series={series}
          height={220}
          formatValue={(v) => formatInr(v, 0, masked)}
          ariaLabel={`Portfolio value chart, ${RANGE_LABELS[range]}`}
        />
      ) : (
        <p className={styles.note}>Not enough price history yet for this range.</p>
      )}
      <p className={styles.note}>
        Approximate: current holdings&rsquo; quantities applied to real historical prices, not a transaction-by-transaction
        history.
      </p>
    </section>
  );
}

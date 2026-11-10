'use client';

import { useState } from 'react';
import { PillTabs } from './PillTabs';
import { LineChart } from './LineChart';
import { formatInr } from '@/lib/dashboard/format';
import type { RangeSeries } from '@/lib/dashboard/chartMath';
import type { PricePeriod } from '@/lib/dashboard/fundamentalsApi';
import { computeHero } from '@/lib/dashboard/heroMetrics';
import { ReturnBadge } from './ReturnBadge';
import { HERO_RANGES, HERO_RANGE_LABELS, seriesForRange, type HeroRange } from '@/lib/dashboard/heroRanges';
import styles from './HeroPortfolioCard.module.css';

interface HeroPortfolioCardProps {
  readonly totalValue: number;
  readonly invested: number;
  readonly todayChange: number;
  readonly history: Record<PricePeriod, RangeSeries>;
  readonly masked: boolean;
}

/** One card for the whole portfolio story: value, today's P&L, total return, and the chart with its timeframes. */
export function HeroPortfolioCard({ totalValue, invested, todayChange, history, masked }: HeroPortfolioCardProps) {
  const [range, setRange] = useState<HeroRange>('1y');
  const metrics = computeHero({ totalValue, invested, todayChange });
  const series = seriesForRange(history, range);

  return (
    <section className={styles.card} aria-label="Portfolio performance">
      <div className={styles.head}>
        <div className={styles.headMain}>
          <p className={styles.label}>Portfolio value</p>
          <p className={styles.value}>{formatInr(totalValue, 0, masked)}</p>
          <div className={styles.badges}>
            <ReturnBadge label="Today" figure={metrics.today} masked={masked} />
            <ReturnBadge label="Total return" figure={metrics.total} masked={masked} />
          </div>
        </div>
        <div className={styles.tabs}>
          <PillTabs options={HERO_RANGES} value={range} onChange={setRange} labels={HERO_RANGE_LABELS} />
        </div>
      </div>

      {series.v.length > 1 ? (
        <LineChart series={series} height={240} formatValue={(v) => formatInr(v, 0, masked)} ariaLabel={`Portfolio value chart, ${HERO_RANGE_LABELS[range]}`} />
      ) : (
        <p className={styles.empty}>Not enough price history yet for this range.</p>
      )}
    </section>
  );
}

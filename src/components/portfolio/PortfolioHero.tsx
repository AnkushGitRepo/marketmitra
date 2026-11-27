'use client';

import { useState } from 'react';
import { LineChart } from '@/components/dashboard-charts/LineChart';
import { CompareChart } from '@/components/portfolio/CompareChart';
import { alphaPct, returnPct, volatilityFan } from '@/lib/portfolio/compare';
import { PillTabs } from '@/components/dashboard-charts/PillTabs';
import { ReturnBadge } from '@/components/dashboard-charts/ReturnBadge';
import { formatInr } from '@/lib/dashboard/format';
import { compactInr } from '@/lib/dashboard/chartGeometry';
import { computeHero } from '@/lib/dashboard/heroMetrics';
import type { RangeSeries } from '@/lib/dashboard/chartMath';
import type { PricePeriod } from '@/lib/dashboard/fundamentalsApi';
import type { PortfolioTotals } from '@/lib/portfolio/portfolioMetrics';
import styles from './PortfolioHero.module.css';

const RANGE_OPTIONS: readonly PricePeriod[] = ['1mo', '6mo', '1y', '5y'];
const MODE_OPTIONS = ['performance', 'benchmark', 'range'] as const;
type ChartMode = (typeof MODE_OPTIONS)[number];
const MODE_LABELS: Record<ChartMode, string> = { performance: 'Performance', benchmark: 'vs Nifty 50', range: 'Range' };
const RANGE_LABELS: Record<PricePeriod, string> = { '1mo': '1M', '6mo': '6M', '1y': '1Y', '5y': '5Y' };

interface PortfolioHeroProps {
  readonly totals: PortfolioTotals;
  readonly history: Record<PricePeriod, RangeSeries>;
  /** Nifty 50 closes aligned to each range's dates; empty when the index data is unavailable. */
  readonly benchmark: Record<PricePeriod, readonly (number | null)[]>;
  readonly masked: boolean;
}

/** Value, invested, total return and today's change side by side, with the performance chart directly below. */
export function PortfolioHero({ totals, history, benchmark, masked }: PortfolioHeroProps) {
  const [range, setRange] = useState<PricePeriod>('1y');
  const [mode, setMode] = useState<ChartMode>('performance');
  const metrics = computeHero(totals);
  const series = history[range];
  const bench = benchmark[range] ?? [];
  const haveBench = bench.length === series.v.length && bench.length > 1 && bench.every((v) => v !== null);
  const portfolioPct = returnPct(series.v);
  const benchPct = returnPct(bench);
  const alpha = alphaPct(portfolioPct, benchPct);
  const fan = volatilityFan(series.v);
  const modes = MODE_OPTIONS.filter((m) => (m === 'benchmark' ? haveBench : m === 'range' ? fan !== null : true));
  const active: ChartMode = modes.includes(mode) ? mode : 'performance';
  const pctAxis = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;

  return (
    <section className={styles.card} aria-label="Portfolio summary">
      <div className={styles.head}>
        <div className={styles.kpis}>
          <div className={styles.valueBlock}>
            <p className={`${styles.label} ${styles.valueLabel}`}>Current value</p>
            <p className={styles.value}>{formatInr(totals.totalValue, 0, masked)}</p>
          </div>
          <div className={styles.investedBlock}>
            <p className={styles.label}>Invested</p>
            <p className={styles.invested}>{formatInr(totals.invested, 0, masked)}</p>
          </div>
          <div className={styles.badges}>
            <ReturnBadge label="Total return" shortLabel="Total" figure={metrics.total} masked={masked} />
            <ReturnBadge label="Today" figure={metrics.today} masked={masked} live />
          </div>
        </div>
        <div className={styles.tabs}>
          <PillTabs options={RANGE_OPTIONS} value={range} onChange={setRange} labels={RANGE_LABELS} />
        </div>
      </div>

      {modes.length > 1 ? (
        <div className={styles.modes}>
          <PillTabs options={modes} value={active} onChange={setMode} labels={MODE_LABELS} />
          {active === 'benchmark' && alpha !== null ? (
            <span className={styles.alpha} data-tone={alpha >= 0 ? 'up' : 'down'}>
              {alpha >= 0 ? '+' : '-'}{Math.abs(alpha).toFixed(1)} pts vs Nifty 50
            </span>
          ) : null}
        </div>
      ) : null}

      {series.v.length > 1 && active === 'benchmark' ? (
        <CompareChart
          labels={series.l}
          primary={portfolioPct.map((v) => v ?? 0)}
          secondary={benchPct.map((v) => v ?? 0)}
          primaryName="Your portfolio"
          secondaryName="Nifty 50"
          formatAxis={pctAxis}
          ariaLabel={`Portfolio return against Nifty 50, ${RANGE_LABELS[range]}${alpha === null ? '' : `. Difference ${alpha.toFixed(1)} percentage points`}`}
        />
      ) : series.v.length > 1 && active === 'range' && fan ? (
        <>
          <CompareChart
            labels={series.l}
            primary={series.v}
            fan={fan}
            primaryName="Your portfolio"
            formatAxis={masked ? () => '•••' : compactInr}
            ariaLabel={`Portfolio value with a plausible range ahead based on past volatility, ${RANGE_LABELS[range]}`}
          />
          <p className={styles.note}>Not a forecast: a statistical range from how much this portfolio has moved before. It says nothing about where prices will go.</p>
        </>
      ) : series.v.length > 1 ? (
        <LineChart
          series={series}
          height={220}
          formatValue={(v) => formatInr(v, 0, masked)}
          formatAxis={masked ? () => '•••' : compactInr}
          showStats
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

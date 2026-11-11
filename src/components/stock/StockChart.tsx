'use client';

import dynamic from 'next/dynamic';
import { useMemo, useState } from 'react';
import { ChartErrorBoundary } from '@/components/pro-chart/ChartErrorBoundary';
import { ChartFallbackPanel } from '@/components/pro-chart/ChartFallback';
import { ChartStatus } from '@/components/pro-chart/ChartStatus';
import { useChartBars } from '@/components/pro-chart/useChartBars';
import { buildLineChart } from '@/lib/chart/fallback';
import type { Bar, RangeKey } from '@/lib/chart/bars';
import { MOBILE_RANGES, rangeChangePct, windowBars, type MobileRange } from '@/lib/stock/chartRange';
import { useIsMobile } from './useIsMobile';
import styles from './StockChart.module.css';

// Canvas chart: browser-only, so it's kept out of the server render + bundle.
const ProChart = dynamic(() => import('@/components/pro-chart/ProChart').then((m) => m.ProChart), {
  ssr: false,
  loading: () => <div className={styles.placeholder} aria-hidden="true" />,
});

const W = 640;
const H = 260;

interface StockChartProps {
  readonly symbol: string;
  readonly bars: Bar[];
  readonly alertHref: string;
  readonly onRangeChange: (range: RangeKey) => void;
}

/** Desktop: the full interactive chart. Phone: a plain area chart that never captures touch scrolling, with the full chart one tap away. */
export function StockChart({ symbol, bars, alertHref, onRangeChange }: StockChartProps) {
  const chartData = useChartBars(symbol, bars);
  const isMobile = useIsMobile();
  const [fullscreen, setFullscreen] = useState(false);

  if (chartData.status !== 'ready') return <ChartStatus status={chartData.status} onRetry={chartData.retry} />;

  const pro = (
    <ChartErrorBoundary
      key={symbol}
      fallback={(reset) => (
        <ChartFallbackPanel symbol={symbol} bars={chartData.bars} reason="The chart hit a problem, so a simple view is shown." onRetry={reset} />
      )}
    >
      <ProChart key={symbol} symbol={symbol} bars={chartData.bars} alertHref={alertHref} onRangeChange={onRangeChange} />
    </ChartErrorBoundary>
  );

  if (!isMobile) return pro;

  return (
    <>
      <AreaChart symbol={symbol} bars={chartData.bars} onOpenFull={() => setFullscreen(true)} />
      {fullscreen && (
        <dialog
          className={styles.dialog}
          ref={(el) => {
            if (el && !el.open) el.showModal();
          }}
          onClose={() => setFullscreen(false)}
          aria-label={`${symbol} candlestick chart`}
        >
          <button type="button" className={styles.closeBtn} onClick={() => setFullscreen(false)}>
            Close
          </button>
          <div className={styles.dialogBody}>{pro}</div>
        </dialog>
      )}
    </>
  );
}

function AreaChart({ symbol, bars, onOpenFull }: { symbol: string; bars: readonly Bar[]; onOpenFull: () => void }) {
  const [range, setRange] = useState<MobileRange>('1Y');
  const windowed = useMemo(() => windowBars(bars, range), [bars, range]);
  const chart = useMemo(() => buildLineChart(windowed, W, H), [windowed]);
  const change = rangeChangePct(windowed);
  const up = (change ?? 0) >= 0;

  return (
    <section className={styles.card} aria-label={`${symbol} price chart`}>
      <div className={styles.head}>
        <div className={styles.tabs} role="tablist" aria-label="Chart range">
          {MOBILE_RANGES.map((r) => (
            <button key={r} type="button" role="tab" aria-selected={r === range} className={`${styles.tab} ${r === range ? styles.tabActive : ''}`} onClick={() => setRange(r)}>
              {r}
            </button>
          ))}
        </div>
        {change !== null && (
          <span className={styles.change} style={{ color: up ? 'var(--app-gain)' : 'var(--app-loss)' }}>
            {up ? '+' : ''}
            {change.toFixed(2)}%
          </span>
        )}
      </div>
      {chart ? (
        // touch-action: pan-y (in CSS) lets a thumb scroll the page straight over the chart.
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={styles.svg} role="img" aria-label={`${symbol} closing price, ${range}`}>
          <path d={chart.areaPath} className={up ? styles.areaUp : styles.areaDown} />
          <path d={chart.path} fill="none" className={up ? styles.lineUp : styles.lineDown} vectorEffect="non-scaling-stroke" />
        </svg>
      ) : (
        <p className={styles.empty}>Not enough price history to draw a chart.</p>
      )}
      <button type="button" className={styles.fullBtn} onClick={onOpenFull}>
        <span aria-hidden="true">⛶</span> Fullscreen candles
      </button>
    </section>
  );
}

'use client';

import { useMemo } from 'react';
import type { Bar } from '@/lib/chart/bars';
import { buildLineChart } from '@/lib/chart/fallback';
import styles from './ProChart.module.css';

const W = 640;
const H = 300;
const fmt = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 2 });

interface ChartFallbackProps {
  readonly symbol: string;
  readonly bars: readonly Bar[];
  /** Why we are showing this instead of the interactive chart. */
  readonly reason: string;
  /** Offers a way back to the interactive chart. */
  readonly onRetry?: () => void;
}

/** A plain SVG close-price line, drawn from the same bars, shown when the interactive chart can't be. */
export function ChartFallback({ symbol, bars, reason, onRetry }: ChartFallbackProps) {
  const chart = useMemo(() => buildLineChart(bars.slice(-260), W, H), [bars]);
  const up = chart ? chart.last >= chart.first : true;

  return (
    <div className={styles.fallback} role="img" aria-label={`${symbol} closing price, last year`}>
      <div className={styles.fallbackNotice}>
        <span>{reason}</span>
        {onRetry && (
          <button type="button" className={styles.fallbackBtn} onClick={onRetry}>
            Try interactive chart
          </button>
        )}
      </div>
      {chart ? (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={styles.fallbackSvg} aria-hidden="true">
            <path d={chart.areaPath} className={up ? styles.fallbackAreaUp : styles.fallbackAreaDown} />
            <path d={chart.path} fill="none" className={up ? styles.fallbackLineUp : styles.fallbackLineDown} vectorEffect="non-scaling-stroke" />
          </svg>
          <div className={styles.fallbackScale}>
            <span>Low ₹{fmt(chart.min)}</span>
            <span>Last ₹{fmt(chart.last)}</span>
            <span>High ₹{fmt(chart.max)}</span>
          </div>
        </>
      ) : (
        <p className={styles.empty}>No price history available.</p>
      )}
    </div>
  );
}

/** Sized, bordered container for when the whole chart component (not just the canvas) failed. */
export function ChartFallbackPanel(props: ChartFallbackProps) {
  return (
    <div className={styles.fallbackPanel}>
      <ChartFallback {...props} />
    </div>
  );
}

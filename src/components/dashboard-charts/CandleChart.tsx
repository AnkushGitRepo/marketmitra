'use client';

import { useState } from 'react';
import type { CandlePoint } from '@/lib/dashboard/chartMath';
import shared from './LineChart.module.css';
import styles from './CandleChart.module.css';

interface CandleChartProps {
  candles: CandlePoint[];
  height: number;
  formatValue: (v: number) => string;
  /** Same contract as LineChart: the chart is the primary way to see the
   * trend, so callers supply a real description for screen readers. */
  ariaLabel: string;
}

const PLOT_TOP = 16;
const PLOT_BOTTOM = 8;

export function CandleChart({ candles, height, formatValue, ariaLabel }: CandleChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const min = Math.min(...candles.map((c) => c.low));
  const max = Math.max(...candles.map((c) => c.high));
  const span = max - min || 1;
  const plotHeight = height - PLOT_TOP - PLOT_BOTTOM;
  // Distance from the bottom of the plot area, in px.
  const yFromBottom = (v: number) => PLOT_BOTTOM + ((v - min) / span) * plotHeight;

  // Same de-duplication as LineChart: show an axis label only where it changes.
  const tickLabels = candles.map((c, i) => (i > 0 && candles[i - 1].label === c.label ? '' : c.label));

  const hovered = hoverIndex === null ? null : candles[Math.min(hoverIndex, candles.length - 1)];
  const hoveredUp = hovered ? hovered.close >= hovered.open : true;

  return (
    <div className={shared.wrap}>
      <div className={styles.plot} style={{ height }} role="img" aria-label={ariaLabel}>
        <div className={styles.gridLine} style={{ bottom: yFromBottom(min + span * 0.25) }} />
        <div className={styles.gridLine} style={{ bottom: yFromBottom(min + span * 0.5) }} />
        <div className={styles.gridLine} style={{ bottom: yFromBottom(min + span * 0.75) }} />
        {candles.map((c, i) => {
          const up = c.close >= c.open;
          const color = up ? 'var(--color-mint-strong)' : 'var(--color-danger-soft)';
          const bodyBottom = yFromBottom(Math.min(c.open, c.close));
          const bodyTop = yFromBottom(Math.max(c.open, c.close));
          return (
            <div className={`${styles.col} ${hoverIndex === i ? styles.colActive : ''}`} key={c.date}>
              <div
                className={styles.wick}
                style={{ bottom: yFromBottom(c.low), height: yFromBottom(c.high) - yFromBottom(c.low), background: color }}
              />
              <div
                className={styles.body}
                // A flat candle (open === close) still needs a visible body.
                style={{ bottom: bodyBottom, height: Math.max(2, bodyTop - bodyBottom), background: color }}
              />
            </div>
          );
        })}
      </div>

      <div className={shared.labels}>
        {tickLabels.map((label, i) => (
          <span key={i} className={shared.labelTick}>
            {label}
          </span>
        ))}
      </div>

      <div className={shared.hoverLayer}>
        {candles.map((c, i) => (
          <div
            key={c.date}
            className={shared.hoverCell}
            onMouseEnter={() => setHoverIndex(i)}
            onMouseLeave={() => setHoverIndex(null)}
          />
        ))}
      </div>

      {hovered && (
        <div
          className={shared.tooltip}
          style={{ left: `${((hoverIndex! + 0.5) / candles.length) * 100}%` }}
        >
          <p className={shared.tooltipLabel}>
            {new Date(hovered.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <p className={shared.tooltipValue}>{formatValue(hovered.close)}</p>
          <p className={shared.tooltipDelta} style={{ color: hoveredUp ? undefined : 'var(--color-danger-soft)' }}>
            O {formatValue(hovered.open)} · H {formatValue(hovered.high)} · L {formatValue(hovered.low)}
          </p>
        </div>
      )}
    </div>
  );
}

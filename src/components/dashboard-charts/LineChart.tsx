'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { RangeSeries } from '@/lib/dashboard/chartMath';
import {
  areaPath, nearestIndex, niceTicks, plotPoints, seriesStats, smoothPath, visibleTicks, yFor, type Padding,
} from '@/lib/dashboard/chartGeometry';
import styles from './LineChart.module.css';

interface LineChartProps {
  series: RangeSeries;
  /** Total height in pixels, including the date axis. */
  height: number;
  formatValue: (v: number) => string;
  /** Replaces the tooltip's computed "change since the start" line. */
  deltaLabel?: (v: number) => string;
  /** Short labels for the value axis and the high and low markers ("₹54.8k"). Without it the chart has no value axis. */
  formatAxis?: (v: number) => string;
  /** Show High, Low and Change for the range above the chart. */
  showStats?: boolean;
  /** This chart is the primary way to see the trend: a screen reader can't parse the SVG, so it needs a real description. */
  ariaLabel: string;
}

const MIN_TICK_GAP = 64;
const BOTTOM_PAD = 28;
const RIGHT_PAD = 14;
const AXIS_PAD = 54;
const BARE_PAD = 10;
const TOOLTIP_GAP = 16;
const TOOLTIP_HEIGHT = 84;
const KEYS = new Set(['ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape']);

const sign = (n: number) => (n >= 0 ? '+' : '-');

/**
 * The value chart. Drawn at its real pixel width (nothing is stretched), a smooth line that is brand teal when the range
 * is up and the loss colour when it is down, with a crosshair that follows the pointer, a finger or the arrow keys.
 */
export function LineChart({ series, height, formatValue, deltaLabel, formatAxis, showStats = false, ariaLabel }: LineChartProps) {
  const gradientId = useId();
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [active, setActive] = useState<number | null>(null);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const stats = seriesStats(series.v);
  const up = (stats?.change ?? 0) >= 0;
  const color = up ? 'var(--app-teal)' : 'var(--app-loss)';
  const pad: Padding = { top: 18, right: RIGHT_PAD, bottom: BOTTOM_PAD, left: formatAxis ? AXIS_PAD : BARE_PAD };
  const pts = width > 0 ? plotPoints(series.v, series.l, width, height, pad) : [];
  const line = smoothPath(pts);
  const baseY = height - pad.bottom;
  const ticks = stats ? niceTicks(Math.min(...series.v), Math.max(...series.v), 4) : [];
  const point = active === null ? null : (pts[active] ?? null);
  const startY = stats ? yFor(stats.first, series.v, height, pad) : 0;

  const move = (e: PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setActive(nearestIndex(e.clientX - rect.left, series.v.length, rect.width, pad));
  };

  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!KEYS.has(e.key) || series.v.length === 0) return;
    e.preventDefault();
    const last = series.v.length - 1;
    if (e.key === 'Escape') return setActive(null);
    if (e.key === 'Home') return setActive(0);
    if (e.key === 'End') return setActive(last);
    setActive((i) => Math.min(last, Math.max(0, (i ?? last) + (e.key === 'ArrowRight' ? 1 : -1))));
  };

  const delta = (v: number): string => {
    if (deltaLabel) return deltaLabel(v);
    if (!stats) return '';
    const diff = v - stats.first;
    const pct = stats.first === 0 ? '' : ` (${sign(diff)}${Math.abs((diff / stats.first) * 100).toFixed(1)}%)`;
    return `${sign(diff)}${formatValue(Math.abs(diff))}${pct} since the start`;
  };

  // The tooltip sits beside the cursor, on whichever side has room, so it never covers the line it is describing.
  const tooltipOnLeft = point ? point.x > width / 2 : false;
  const tooltipTop = point ? Math.min(Math.max(point.y - TOOLTIP_HEIGHT / 2, 0), Math.max(height - TOOLTIP_HEIGHT, 0)) : 0;
  const markers = formatAxis && stats ? [stats.high, stats.low] : [];

  return (
    <div className={styles.wrap}>
      {showStats && stats ? (
        <dl className={styles.stats}>
          <div><dt>High</dt><dd>{formatValue(stats.high.value)}</dd></div>
          <div><dt>Low</dt><dd>{formatValue(stats.low.value)}</dd></div>
          <div data-tone={up ? 'up' : 'down'}>
            <dt>Change</dt>
            <dd>{sign(stats.change)}{formatValue(Math.abs(stats.change))}{stats.changePct === null ? '' : ` (${sign(stats.change)}${Math.abs(stats.changePct).toFixed(1)}%)`}</dd>
          </div>
        </dl>
      ) : null}

      <div
        ref={frameRef}
        className={styles.frame}
        style={{ height }}
        tabIndex={0}
        role="group"
        aria-label={`${ariaLabel}. Use the left and right arrow keys to read each value.`}
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={() => setActive(null)}
        onKeyDown={key}
        onBlur={() => setActive(null)}
      >
        {width > 0 && pts.length > 0 ? (
          <svg width={width} height={height} className={styles.svg} aria-hidden="true">
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.24" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>

            {ticks.map((t) => {
              const y = yFor(t, series.v, height, pad);
              return (
                <g key={t}>
                  <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className={styles.grid} />
                  {formatAxis ? <text x={pad.left - 8} y={y + 3.5} textAnchor="end" className={styles.axisText}>{formatAxis(t)}</text> : null}
                </g>
              );
            })}

            {stats && pts.length > 1 ? <line x1={pad.left} x2={width - pad.right} y1={startY} y2={startY} className={styles.start} /> : null}

            <path d={areaPath(line, pts, baseY)} fill={`url(#${gradientId})`} className={styles.area} />
            <path d={line} pathLength={1} fill="none" stroke={color} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" className={styles.line} />

            {markers.map((m, i) => {
              const p = pts[m.index];
              if (!p || !formatAxis) return null;
              const anchor = p.x < 40 ? 'start' : p.x > width - 40 ? 'end' : 'middle';
              return (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={4} fill={color} stroke="var(--color-surface)" strokeWidth={2} />
                  <text x={p.x} y={p.y - 10} textAnchor={anchor} className={styles.markerText}>{formatAxis(m.value)}</text>
                </g>
              );
            })}

            {visibleTicks(pts, MIN_TICK_GAP).map((p) => (
              <text key={p.i} x={p.x} y={height - 8} textAnchor={p.i === 0 ? 'start' : p.i === pts.length - 1 ? 'end' : 'middle'} className={styles.axisText}>{p.label}</text>
            ))}

            {point ? (
              <g>
                <line x1={point.x} x2={point.x} y1={pad.top - 6} y2={baseY} className={styles.cursor} />
                <circle cx={point.x} cy={point.y} r={11} fill={color} opacity={0.18} />
                <circle cx={point.x} cy={point.y} r={5.5} fill="var(--color-surface)" stroke={color} strokeWidth={2.6} />
              </g>
            ) : null}
          </svg>
        ) : null}

        {point ? (
          <div
            className={`${styles.tooltip} ${tooltipOnLeft ? styles.tooltipLeft : ''}`}
            style={{ left: tooltipOnLeft ? point.x - TOOLTIP_GAP : point.x + TOOLTIP_GAP, top: tooltipTop }}
            data-tone={up ? 'up' : 'down'}
          >
            <p className={styles.tooltipLabel}>{point.label}</p>
            <p className={styles.tooltipValue}>{formatValue(point.v)}</p>
            <p className={styles.tooltipDelta}>{delta(point.v)}</p>
          </div>
        ) : null}
      </div>

      <p className={styles.srOnly} aria-live="polite">{point ? `${point.label}: ${formatValue(point.v)}. ${delta(point.v)}` : ''}</p>
    </div>
  );
}

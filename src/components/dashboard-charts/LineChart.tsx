'use client';

import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { RangeSeries } from '@/lib/dashboard/chartMath';
import {
  areaPath, nearestIndex, niceTicks, plotPoints, seriesStats, smoothPath, valueDomain, visibleTicks, yFor, type Padding,
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

/** Share of the value range left clear above the high and below the low, so the curve never rides the edge or the axis. */
const DOMAIN_PAD = 0.1;
const MIN_TICK_GAP = 64;
const MARKER_CHAR_W = 6.6;
const MARKER_H = 17;
const BOTTOM_PAD = 32;
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
  const pts = width > 0 ? plotPoints(series.v, series.l, width, height, pad, DOMAIN_PAD) : [];
  const line = smoothPath(pts);
  const baseY = height - pad.bottom;
  const domain = valueDomain(series.v, DOMAIN_PAD);
  const ticks = stats ? niceTicks(domain.min, domain.max, 4) : [];
  const point = active === null ? null : (pts[active] ?? null);
  const startY = stats ? yFor(stats.first, series.v, height, pad, DOMAIN_PAD) : 0;

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
          <div><dt>High</dt><dd><Amount value={stats.high.value} long={formatValue} short={formatAxis} /></dd></div>
          <div><dt>Low</dt><dd><Amount value={stats.low.value} long={formatValue} short={formatAxis} /></dd></div>
          <div data-tone={up ? 'up' : 'down'}>
            <dt>Change</dt>
            <dd>
              {sign(stats.change)}<Amount value={Math.abs(stats.change)} long={formatValue} short={formatAxis} />
              {stats.changePct === null ? '' : ` (${sign(stats.change)}${Math.abs(stats.changePct).toFixed(1)}%)`}
            </dd>
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
              const y = yFor(t, series.v, height, pad, DOMAIN_PAD);
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
              const text = formatAxis(m.value);
              const boxW = text.length * MARKER_CHAR_W + 14;
              // High above its dot, low below it (there is room: the scale is padded). The badge is kept inside the plot, clear of the value axis.
              const isHigh = i === 0;
              const boxX = Math.min(Math.max(p.x - boxW / 2, pad.left), Math.max(width - boxW - 4, pad.left));
              const below = p.y + 8;
              // The low badge drops below its dot only if it then still clears the date axis; otherwise it sits above.
              const fitsBelow = below + MARKER_H <= baseY - 2;
              const boxY = isHigh || !fitsBelow ? p.y - MARKER_H - 8 : below;
              return (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={4} fill={color} stroke="var(--color-surface)" strokeWidth={2} />
                  <rect x={boxX} y={boxY} width={boxW} height={MARKER_H} rx={MARKER_H / 2} className={styles.markerBadge} />
                  <text x={boxX + boxW / 2} y={boxY + MARKER_H / 2 + 3.5} textAnchor="middle" className={styles.markerText}>{text}</text>
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

/** An amount in full, or in short units on a narrow screen (CSS shows one of the two). Without a short formatter it is just the full form. */
function Amount({ value, long, short }: { readonly value: number; readonly long: (v: number) => string; readonly short?: (v: number) => string }) {
  if (!short) return <>{long(value)}</>;
  return (
    <>
      <span className={styles.amountLong}>{long(value)}</span>
      <span className={styles.amountShort}>{short(value)}</span>
    </>
  );
}

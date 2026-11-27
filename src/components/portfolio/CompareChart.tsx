'use client';

import { useEffect, useRef, useState } from 'react';
import { niceTicks, smoothPath, valueDomain, visibleTicks, yFor, type Padding, type PlotPoint } from '@/lib/dashboard/chartGeometry';
import type { Fan } from '@/lib/portfolio/compare';
import styles from './CompareChart.module.css';

interface CompareChartProps {
  readonly labels: readonly string[];
  /** The portfolio line. */
  readonly primary: readonly number[];
  /** A dashed comparison line over the same points. */
  readonly secondary?: readonly number[];
  /** A statistical range drawn forward from the last point. */
  readonly fan?: Fan;
  readonly primaryName: string;
  readonly secondaryName?: string;
  readonly formatAxis: (v: number) => string;
  readonly height?: number;
  readonly ariaLabel: string;
}

const PAD: Padding = { top: 16, right: 14, bottom: 32, left: 54 };
const MIN_TICK_GAP = 64;

/** Two lines on one scale, or one line plus a range fan. Static: no hover, the caption and legend carry the numbers. */
export function CompareChart({ labels, primary, secondary, fan, primaryName, secondaryName, formatAxis, height = 240, ariaLabel }: CompareChartProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const total = primary.length + (fan ? fan.hi.length : 0);
  const domainValues = [...primary, ...(secondary ?? []), ...(fan ? [...fan.lo, ...fan.hi] : [])];
  const innerW = Math.max(width - PAD.left - PAD.right, 1);
  const xAt = (i: number) => PAD.left + (total <= 1 ? innerW / 2 : (i * innerW) / (total - 1));
  const yAt = (v: number) => yFor(v, domainValues, height, PAD, 0.08);
  const toPoints = (values: readonly number[], offset = 0): PlotPoint[] => values.map((v, i) => ({ i: i + offset, x: xAt(i + offset), y: yAt(v), v, label: labels[i + offset] ?? '' }));

  const main = toPoints(primary);
  const second = secondary ? toPoints(secondary) : [];
  const domain = valueDomain(domainValues, 0.08);
  const ticks = niceTicks(domain.min, domain.max, 4);
  const lastMain = main[main.length - 1];
  const fanHi = fan ? toPoints(fan.hi, primary.length) : [];
  const fanLo = fan ? toPoints(fan.lo, primary.length) : [];
  const fanPath = fan && lastMain
    ? `M${lastMain.x.toFixed(1)} ${lastMain.y.toFixed(1)} ${fanHi.map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')} ${[...fanLo].reverse().map((p) => `L${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ')} Z`
    : '';

  return (
    <div>
      <p className={styles.legend}>
        <span className={styles.key}><i className={styles.swatchMain} />{primaryName}</span>
        {secondary && secondaryName ? <span className={styles.key}><i className={styles.swatchSecond} />{secondaryName}</span> : null}
        {fan ? <span className={styles.key}><i className={styles.swatchFan} />Plausible range (±1 standard deviation of past moves)</span> : null}
      </p>
      <div ref={frameRef} className={styles.frame} style={{ height }} role="img" aria-label={ariaLabel}>
        {width > 0 && main.length > 0 ? (
          <svg width={width} height={height} aria-hidden="true">
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={width - PAD.right} y1={yAt(t)} y2={yAt(t)} className={styles.grid} />
                <text x={PAD.left - 8} y={yAt(t) + 3.5} textAnchor="end" className={styles.axisText}>{formatAxis(t)}</text>
              </g>
            ))}
            {fan ? <path d={fanPath} className={styles.fan} /> : null}
            {second.length > 1 ? <path d={smoothPath(second)} fill="none" className={styles.second} /> : null}
            <path d={smoothPath(main)} fill="none" className={styles.main} />
            {lastMain ? <circle cx={lastMain.x} cy={lastMain.y} r={4} className={styles.dot} /> : null}
            {visibleTicks(main, MIN_TICK_GAP).map((p) => (
              <text key={p.i} x={p.x} y={height - 10} textAnchor={p.i === 0 ? 'start' : 'middle'} className={styles.axisText}>{p.label}</text>
            ))}
          </svg>
        ) : null}
      </div>
    </div>
  );
}

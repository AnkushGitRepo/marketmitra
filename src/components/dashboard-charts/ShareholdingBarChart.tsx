'use client';

import { useState } from 'react';
import type { ShareholdingSeries } from '@/lib/dashboard/transforms';
import styles from './ShareholdingBarChart.module.css';

interface ShareholdingBarChartProps {
  series: ShareholdingSeries[];
  ariaLabel: string;
}

const TOP = 14;
const BOTTOM = 186;
const WIDTH = 600;
const AXIS_VALUES = [0, 25, 50, 75, 100];

interface HoverState {
  periodIndex: number;
  category: string;
  value: number;
  segTop: number;
  segBottom: number;
}

function periodLabel(quarterEnd: string): string {
  const d = new Date(quarterEnd);
  const month = d.toLocaleDateString('en-IN', { month: 'short' });
  return `${month} '${String(d.getFullYear()).slice(-2)}`;
}

/** Maps a 0-100 share percentage to an SVG y-coordinate (100% at the top). */
function yFor(pct: number): number {
  return BOTTOM - (Math.max(0, Math.min(100, pct)) / 100) * (BOTTOM - TOP);
}

export function ShareholdingBarChart({ series, ariaLabel }: ShareholdingBarChartProps) {
  const [hover, setHover] = useState<HoverState | null>(null);

  const periods = [...new Set(series.flatMap((s) => s.points.map((p) => p.quarterEnd)))].sort();

  if (periods.length === 0) return null;

  const byCategory = new Map(series.map((s) => [s.category, new Map(s.points.map((p) => [p.quarterEnd, p.percentage]))]));

  const band = WIDTH / periods.length;
  const barWidth = Math.min(band * 0.6, 90);
  const barX = (i: number) => i * band + (band - barWidth) / 2;

  return (
    <div className={styles.wrap}>
      <div className={styles.chartRow}>
        <div className={styles.axis}>
          {AXIS_VALUES.map((v) => (
            <span key={v} className={styles.axisLabel} style={{ top: `${(yFor(v) / 200) * 100}%` }}>
              {v}%
            </span>
          ))}
        </div>
        <div className={styles.chartCol}>
          <div className={styles.chartWrap}>
            <svg viewBox="0 0 600 200" preserveAspectRatio="none" className={styles.svg} role="img" aria-label={ariaLabel}>
              {AXIS_VALUES.map((v) => (
                <line key={v} x1="0" x2="600" y1={yFor(v)} y2={yFor(v)} stroke="#F1EDE3" strokeWidth={1} />
              ))}
              {periods.map((period, pi) => {
                let cumulative = 0;
                return (
                  <g key={period} style={{ '--bar-i': pi } as React.CSSProperties}>
                    {series.map((s) => {
                      const value = byCategory.get(s.category)?.get(period) ?? 0;
                      const from = cumulative;
                      const to = cumulative + value;
                      cumulative = to;
                      if (value <= 0) return null;
                      const segTop = yFor(to);
                      const segBottom = yFor(from);
                      const isHovered = hover?.periodIndex === pi && hover.category === s.category;
                      return (
                        <rect
                          key={s.category}
                          x={barX(pi)}
                          y={segTop}
                          width={barWidth}
                          height={Math.max(0, segBottom - segTop)}
                          fill={s.color}
                          opacity={hover && !isHovered ? 0.55 : 1}
                          rx={2}
                          className={styles.segment}
                          onMouseEnter={() =>
                            setHover({ periodIndex: pi, category: s.category, value, segTop, segBottom })
                          }
                          onMouseLeave={() => setHover(null)}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </svg>

            {hover && (
              <div
                className={styles.tooltip}
                style={{
                  left: `${((barX(hover.periodIndex) + barWidth / 2) / 600) * 100}%`,
                  top: `${(hover.segTop / 200) * 100}%`,
                }}
              >
                {hover.category} — {hover.value.toFixed(1)}% — {periodLabel(periods[hover.periodIndex])}
              </div>
            )}
          </div>
          <div className={styles.ticks}>
            {periods.map((p, i) => (
              <span key={p} className={styles.tick} style={{ left: `${((barX(i) + barWidth / 2) / 600) * 100}%` }}>
                {periodLabel(p)}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className={styles.legend}>
        {series.map((s) => (
          <div key={s.category} className={styles.legendCard}>
            <span className={styles.legendDot} style={{ background: s.color }} />
            <p className={styles.legendName}>{s.category}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

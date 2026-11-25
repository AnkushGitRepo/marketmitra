'use client';

import { useState } from 'react';
import type { FinancialChartBlock } from '@/lib/research/blocks';
import { linePaths } from '@/lib/research/chartMath';
import { formatCroreCompact, niceTicks, type FinancialPeriod } from '@/lib/research/financialSeries';
import { formatNumber, formatPercent } from '@/lib/research/formatters';
import styles from './financialChart.module.css';

const W = 900;
const H = 340;
const PAD = { top: 28, right: 54, bottom: 52, left: 62 };
const SALES_COLOR = 'var(--app-ink)';
const PROFIT_COLOR = 'var(--app-teal)';
const MARGIN_COLOR = 'var(--app-warn-accent)';

type View = 'chart' | 'table';

const signed = (v: number | null): string => (v === null ? '—' : `${v >= 0 ? '+' : '−'}${formatNumber(Math.abs(v), 1)}%`);

function describe(p: FinancialPeriod): string {
  return `${p.label}: sales ${formatCroreCompact(p.sales)}, operating profit ${formatCroreCompact(p.operatingProfit)}, margin ${formatPercent(p.opm)}, growth ${signed(p.salesGrowth)}`;
}

function PeriodTable({ block }: { readonly block: FinancialChartBlock }) {
  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Period</th>
            <th>Sales</th>
            <th>Operating profit</th>
            <th>OPM %</th>
            <th>Sales growth</th>
          </tr>
        </thead>
        <tbody>
          {block.periods.map((p) => (
            <tr key={p.periodEnd}>
              <td>{p.label}</td>
              <td>{formatNumber(p.sales, 0)}</td>
              <td>{formatNumber(p.operatingProfit, 0)}</td>
              <td>{formatPercent(p.opm)}</td>
              <td>{signed(p.salesGrowth)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Chart({ block }: { readonly block: FinancialChartBlock }) {
  const [active, setActive] = useState<number | null>(null);
  const periods = block.periods;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const maxValue = Math.max(0, ...periods.flatMap((p) => [p.sales ?? 0, p.operatingProfit ?? 0]));
  const valueTicks = niceTicks(maxValue);
  const valueMax = valueTicks[valueTicks.length - 1];
  const maxMargin = Math.max(0, ...periods.map((p) => p.opm ?? 0));
  const marginTicks = niceTicks(maxMargin, valueTicks.length - 1);
  const marginMax = marginTicks[marginTicks.length - 1];

  const yValue = (v: number) => PAD.top + (1 - v / valueMax) * innerH;
  const yMargin = (v: number) => PAD.top + (1 - v / marginMax) * innerH;
  const band = innerW / periods.length;
  const barW = Math.min(58, band * 0.4);
  const centre = (i: number) => PAD.left + band * i + band / 2;
  const linePoints = periods.map((p, i) => (p.opm === null ? null : ([centre(i), yMargin(p.opm)] as const)));
  const segments = linePaths(linePoints);
  const hovered = active === null ? null : periods[active];

  return (
    <div className={styles.frame}>
      <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label={`${block.title}, ${block.unit}, by fiscal year`}>
        {valueTicks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={W - PAD.right} y1={yValue(t)} y2={yValue(t)} className={t === 0 ? styles.baseline : styles.grid} />
            <text x={PAD.left - 8} y={yValue(t) + 4} textAnchor="end" className={styles.axisText}>
              {formatCroreCompact(t).replace(' Cr', '')}
            </text>
          </g>
        ))}
        {marginTicks.map((t) => (
          <text key={t} x={W - PAD.right + 8} y={yMargin(t) + 4} className={styles.axisTextMargin}>
            {t}%
          </text>
        ))}

        {periods.map((p, i) => {
          const x = centre(i);
          return (
            <g key={p.periodEnd} className={styles.group} data-active={active === i}>
              {p.sales !== null && <rect x={x - barW - 1} y={yValue(p.sales)} width={barW} height={yValue(0) - yValue(p.sales)} rx={3} fill={SALES_COLOR} />}
              {p.operatingProfit !== null && (
                <rect x={x + 1} y={yValue(p.operatingProfit)} width={barW} height={Math.max(yValue(0) - yValue(p.operatingProfit), 0)} rx={3} fill={PROFIT_COLOR} />
              )}
              {p.sales !== null && (
                <text x={x - barW / 2 - 1} y={yValue(p.sales) - 6} textAnchor="middle" className={styles.valueLabel}>
                  {formatCroreCompact(p.sales)}
                </text>
              )}
              {p.operatingProfit !== null && (
                <text x={x + barW / 2 + 1} y={yValue(p.operatingProfit) - 6} textAnchor="middle" className={styles.valueLabel}>
                  {formatCroreCompact(p.operatingProfit)}
                </text>
              )}
              {p.sales === null && p.operatingProfit === null && (
                <text x={x} y={yValue(0) - 10} textAnchor="middle" className={styles.noData}>
                  no data
                </text>
              )}
              <text x={x} y={H - 28} textAnchor="middle" className={styles.periodLabel}>
                {p.label}
              </text>
              <text x={x} y={H - 10} textAnchor="middle" className={styles.growthLabel} data-sign={p.salesGrowth === null ? 'none' : p.salesGrowth >= 0 ? 'up' : 'down'}>
                {p.salesGrowth === null ? '' : `${signed(p.salesGrowth)} YoY`}
              </text>
            </g>
          );
        })}

        {segments.map((seg) => (
          <path key={seg} d={seg} className={styles.marginLine} stroke={MARGIN_COLOR} fill="none" />
        ))}
        {linePoints.map((pt, i) =>
          pt ? (
            <g key={periods[i].periodEnd}>
              <circle cx={pt[0]} cy={pt[1]} r={4} fill="var(--color-surface)" stroke={MARGIN_COLOR} strokeWidth={2} />
              <text x={pt[0]} y={pt[1] - 10} textAnchor="middle" className={styles.marginLabel}>
                {formatPercent(periods[i].opm)}
              </text>
            </g>
          ) : null
        )}

        {periods.map((p, i) => (
          <rect
            key={`hit-${p.periodEnd}`}
            x={PAD.left + band * i}
            y={PAD.top}
            width={band}
            height={innerH + 40}
            className={styles.hit}
            tabIndex={0}
            role="img"
            aria-label={describe(p)}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            onFocus={() => setActive(i)}
            onBlur={() => setActive(null)}
          />
        ))}
      </svg>

      {hovered && active !== null && (
        <div className={styles.tooltip} style={{ left: `${((centre(active) / W) * 100).toFixed(2)}%` }} role="status">
          <strong>{hovered.label}</strong>
          <span>Sales {formatCroreCompact(hovered.sales)}</span>
          <span>Operating profit {formatCroreCompact(hovered.operatingProfit)}</span>
          <span>OPM {formatPercent(hovered.opm)}</span>
          <span>YoY growth {signed(hovered.salesGrowth)}</span>
        </div>
      )}

      <ul className={styles.legend}>
        <li>
          <span className={styles.swatch} style={{ background: SALES_COLOR }} />
          Sales
        </li>
        <li>
          <span className={styles.swatch} style={{ background: PROFIT_COLOR }} />
          Operating profit
        </li>
        <li>
          <span className={styles.swatchLine} style={{ background: MARGIN_COLOR }} />
          OPM % (right axis)
        </li>
      </ul>
    </div>
  );
}

export function FinancialChart({ block }: { readonly block: FinancialChartBlock }) {
  const [view, setView] = useState<View>('chart');
  return (
    <figure className={styles.figure}>
      <div className={styles.head}>
        <figcaption className={styles.title}>
          {block.title} <span className={styles.unit}>{block.unit}</span>
        </figcaption>
        <div className={styles.toggle} role="group" aria-label="View as" data-print-hide>
          {(['chart', 'table'] as const).map((v) => (
            <button key={v} type="button" className={styles.toggleButton} aria-pressed={view === v} onClick={() => setView(v)}>
              {v === 'chart' ? 'Chart' : 'Table'}
            </button>
          ))}
        </div>
      </div>
      {view === 'chart' ? <Chart block={block} /> : <PeriodTable block={block} />}
    </figure>
  );
}

import type { BarChartBlock } from '@/lib/research/blocks';
import { barRange, fraction } from '@/lib/research/chartMath';
import { formatNumber } from '@/lib/research/formatters';

/** Whole numbers stay whole: a rupee P&L reads 9,694, not 9,694.0. */
const label = (v: number | null): string => formatNumber(v, v !== null && Number.isInteger(v) ? 0 : 1);
import { seriesColor } from './palette';
import styles from './blocks.module.css';

const W = 900;
const H = 240;
const PAD = { top: 24, right: 8, bottom: 28, left: 8 };

function Legend({ block }: { readonly block: BarChartBlock }) {
  if (block.series.length < 2) return null;
  return (
    <ul className={styles.legend}>
      {block.series.map((s, i) => (
        <li key={s.name}>
          <span className={styles.swatch} style={{ background: seriesColor(i) }} />
          {s.name}
        </li>
      ))}
    </ul>
  );
}

/** Rows with a bar each, growing right from zero (and left for a loss). Used where the labels are long or many. */
function HorizontalBars({ block }: { readonly block: BarChartBlock }) {
  const range = barRange(block.series.map((s) => s.values));
  const zero = fraction(0, range) * 100;
  return (
    <ul className={styles.hbars}>
      {block.categories.map((cat, row) => (
        <li key={`${row}-${cat}`} className={styles.hrow}>
          <span className={styles.hlabel}>{cat}</span>
          <span className={styles.htrack}>
            <span className={styles.hzero} style={{ left: `${zero}%` }} />
            {block.series.map((s, si) => {
              const v = s.values[row] ?? null;
              if (v === null) return null;
              const at = fraction(v, range) * 100;
              const left = Math.min(at, zero);
              return (
                <span
                  key={s.name}
                  className={styles.hbar}
                  style={{ left: `${left}%`, width: `${Math.max(Math.abs(at - zero), 0.6)}%`, background: v < 0 ? 'var(--app-loss-soft)' : seriesColor(si === 0 ? 1 : si) }}
                />
              );
            })}
          </span>
          <span className={styles.hvalue}>{block.series.map((s) => label(s.values[row] ?? null)).join(' / ')}</span>
        </li>
      ))}
    </ul>
  );
}

function VerticalBars({ block }: { readonly block: BarChartBlock }) {
  const range = barRange(block.series.map((s) => s.values));
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + (1 - fraction(v, range)) * innerH;
  const band = innerW / block.categories.length;
  const barW = Math.min(44, (band * 0.7) / block.series.length);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} role="img" aria-label={`${block.title}, ${block.unit}`}>
      <line x1={PAD.left} x2={W - PAD.right} y1={y(0)} y2={y(0)} className={styles.axis} />
      {block.categories.map((cat, ci) => {
        const groupW = barW * block.series.length;
        const x0 = PAD.left + band * ci + (band - groupW) / 2;
        return (
          <g key={`${ci}-${cat}`}>
            {block.series.map((s, si) => {
              const v = s.values[ci] ?? null;
              if (v === null) {
                // A missing figure is said so, not left as a silent gap.
                return (
                  <text key={s.name} x={x0 + si * barW + (barW - 2) / 2} y={y(0) - 5} textAnchor="middle" className={styles.barValue} opacity={0.6}>
                    N/A
                  </text>
                );
              }
              const top = Math.min(y(v), y(0));
              return (
                <g key={s.name}>
                  <rect x={x0 + si * barW} y={top} width={barW - 2} height={Math.max(Math.abs(y(v) - y(0)), 1)} rx={3} fill={seriesColor(si === 0 && block.series.length === 1 ? 1 : si)}>
                    <title>{`${cat} ${s.name}: ${label(v)} ${block.unit}`}</title>
                  </rect>
                  <text x={x0 + si * barW + (barW - 2) / 2} y={v < 0 ? y(v) + 12 : top - 5} textAnchor="middle" className={styles.barValue}>
                    {label(v)}
                  </text>
                </g>
              );
            })}
            <text x={PAD.left + band * ci + band / 2} y={H - 8} textAnchor="middle" className={styles.tick}>
              {cat}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export function BarChart({ block }: { readonly block: BarChartBlock }) {
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartTitle}>
        {block.title} <span className={styles.unit}>{block.unit}</span>
      </figcaption>
      <Legend block={block} />
      {block.orientation === 'horizontal' ? <HorizontalBars block={block} /> : <VerticalBars block={block} />}
    </figure>
  );
}

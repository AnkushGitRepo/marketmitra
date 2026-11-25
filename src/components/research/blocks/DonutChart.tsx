import type { DonutChartBlock } from '@/lib/research/blocks';
import { donutArcs } from '@/lib/research/chartMath';
import { formatNumber } from '@/lib/research/formatters';
import { seriesColor } from './palette';
import styles from './blocks.module.css';

const RADIUS = 15.9155; // circumference 100, so a share is its own dash length
const GAP = 0.6;

export function DonutChart({ block }: { readonly block: DonutChartBlock }) {
  const arcs = donutArcs(block.slices);
  if (arcs.length === 0) return null;
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.chartTitle}>{block.title}</figcaption>
      <div className={styles.donutRow}>
        <svg viewBox="0 0 42 42" className={styles.donut} role="img" aria-label={block.title}>
          {arcs.map((arc, i) => (
            <circle
              key={arc.label}
              cx={21}
              cy={21}
              r={RADIUS}
              fill="none"
              stroke={seriesColor(i)}
              strokeWidth={6}
              strokeDasharray={`${Math.max(arc.share * 100 - GAP, 0.1)} ${100 - Math.max(arc.share * 100 - GAP, 0.1)}`}
              strokeDashoffset={25 - arc.start * 100}
            >
              <title>{`${arc.label}: ${formatNumber(arc.share * 100)}%`}</title>
            </circle>
          ))}
        </svg>
        <ul className={styles.donutLegend}>
          {arcs.map((arc, i) => (
            <li key={arc.label}>
              <span className={styles.swatch} style={{ background: seriesColor(i) }} />
              <span className={styles.legendLabel}>{arc.label}</span>
              <span className={styles.legendValue}>{formatNumber(arc.share * 100)}%</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

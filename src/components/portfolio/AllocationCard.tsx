import { concentration, donutSegments, sectorWeights, type HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import styles from './AllocationCard.module.css';

const SECTOR_COLORS = ['#0C8A6C', '#3FD0AB', '#C9AF7E', '#D9917F', '#7FDFC2', '#8fa3b8', '#E2DED2'] as const;
const RADIUS = 15.9155; // circumference 100, so arc lengths are plain percentages
const color = (i: number): string => SECTOR_COLORS[i % SECTOR_COLORS.length];

/** Sector donut with a legend, plus the two concentration stats. Static SVG: nothing to load, nothing to fail. */
export function AllocationCard({ holdings }: { readonly holdings: readonly HoldingLike[] }) {
  const weights = sectorWeights(holdings);
  const segments = donutSegments(weights);
  const { top3Pct, largest } = concentration(holdings);

  return (
    <section className={styles.card} aria-label="Sector allocation">
      <h2 className={styles.title}>Sector allocation</h2>
      {segments.length === 0 ? (
        <p className={styles.empty}>Allocation appears once live prices load.</p>
      ) : (
        <div className={styles.body}>
          <svg className={styles.donut} viewBox="0 0 42 42" role="img" aria-label="Sector weights donut chart">
            <circle cx="21" cy="21" r={RADIUS} fill="none" stroke="var(--app-border-softer)" strokeWidth="6" />
            {segments.map((s, i) => (
              <circle
                key={s.name}
                cx="21"
                cy="21"
                r={RADIUS}
                fill="none"
                stroke={color(i)}
                strokeWidth="6"
                pathLength="100"
                strokeDasharray={`${Math.max(s.length - 0.4, 0)} ${100 - Math.max(s.length - 0.4, 0)}`}
                strokeDashoffset={-s.offset}
                transform="rotate(-90 21 21)"
              >
                <title>{`${s.name}: ${s.pct.toFixed(1)}%`}</title>
              </circle>
            ))}
          </svg>
          <ul className={styles.legend}>
            {segments.map((s, i) => (
              <li key={s.name} className={styles.legendRow}>
                <span className={styles.swatch} style={{ background: color(i) }} aria-hidden="true" />
                <span className={styles.name}>{s.name}</span>
                <span className={styles.pct}>{s.pct.toFixed(1)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {largest && (
        <div className={styles.pills}>
          <span className={styles.pill}>
            Top 3 holdings <strong>{top3Pct.toFixed(1)}%</strong>
          </span>
          <span className={styles.pill}>
            Largest position <strong>{largest.symbol} ({largest.pct.toFixed(1)}%)</strong>
          </span>
        </div>
      )}
    </section>
  );
}

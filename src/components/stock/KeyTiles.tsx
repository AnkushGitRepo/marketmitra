import type { KeyTile } from '@/lib/stock/keyRatios';
import styles from './KeyTiles.module.css';

interface KeyTilesProps {
  readonly tiles: readonly KeyTile[];
}

/** Six headline numbers: 6-up on desktop, 2x3 on a phone. */
export function KeyTiles({ tiles }: KeyTilesProps) {
  return (
    <dl className={styles.grid} aria-label="Key ratios">
      {tiles.map((t) => (
        <div key={t.label} className={styles.tile} title={t.hint}>
          <dt className={styles.label}>{t.label}</dt>
          <dd className={styles.value}>{t.value}</dd>
        </div>
      ))}
    </dl>
  );
}

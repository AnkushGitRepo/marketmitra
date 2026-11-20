'use client';

import { LENSES, type Lens, type LensId } from '@/lib/funds/lenses';
import styles from './LensBar.module.css';

interface LensBarProps {
  readonly active: LensId | null;
  readonly loading: boolean;
  readonly onSelect: (lens: Lens) => void;
  readonly onClear: () => void;
}

/** One-click starting points over the 1,800 funds. Picking the active one again goes back to the full list. */
export function LensBar({ active, loading, onSelect, onClear }: LensBarProps) {
  const current = LENSES.find((lens) => lens.id === active);
  return (
    <section className={styles.bar} aria-label="Investor lenses">
      <div className={styles.pills} role="group" aria-label="Start from a lens">
        {LENSES.map((lens) => (
          <button
            key={lens.id}
            type="button"
            className={`${styles.pill} ${lens.id === active ? styles.active : ''}`}
            aria-pressed={lens.id === active}
            title={lens.rule}
            disabled={loading}
            onClick={() => (lens.id === active ? onClear() : onSelect(lens))}
          >
            {lens.label}
          </button>
        ))}
      </div>
      {current && <p className={styles.rule}>{current.rule} These are filters: change any of them below.</p>}
    </section>
  );
}

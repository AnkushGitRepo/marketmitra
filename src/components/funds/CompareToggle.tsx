'use client';

import { useCompareSelection } from './useCompareSelection';
import styles from './CompareToggle.module.css';

interface CompareToggleProps {
  readonly schemeCode: number;
  readonly name: string;
  /** Visible text when not picked; defaults to "Compare". */
  readonly label?: string;
}

/** Adds a fund to, or removes it from, the comparison. The dock shows what is picked. */
export function CompareToggle({ schemeCode, name, label = 'Compare' }: CompareToggleProps) {
  const compare = useCompareSelection();
  const picked = compare.has(schemeCode);
  const blocked = !picked && compare.isFull;
  return (
    <button
      type="button"
      className={`${styles.button} ${picked ? styles.picked : ''} ${blocked ? styles.blocked : ''}`}
      aria-pressed={picked}
      aria-label={picked ? `Remove ${name} from comparison` : `Add ${name} to comparison`}
      title={blocked ? 'Three funds are already picked. Remove one to add another.' : undefined}
      aria-disabled={blocked}
      onClick={() => {
        // aria-disabled, not disabled: the button stays focusable so its reason can be read.
        if (!blocked) compare.toggle({ scheme_code: schemeCode, name });
      }}
    >
      {picked ? '✓ Added' : `+ ${label}`}
    </button>
  );
}

import {
  GROUP_LABEL,
  TYPE_LABEL,
  visibleGroups,
  type IpoGroup,
  type IpoTypeFilter,
} from '@/lib/dashboard/ipoFilters';
import styles from './IpoFilterBar.module.css';

const TYPES: readonly IpoTypeFilter[] = ['all', 'mainboard', 'sme'];

interface IpoFilterBarProps {
  readonly group: IpoGroup;
  readonly type: IpoTypeFilter;
  readonly groupCounts: Record<IpoGroup, number>;
  readonly typeCounts: Record<IpoTypeFilter, number>;
  readonly onGroup: (group: IpoGroup) => void;
  readonly onType: (type: IpoTypeFilter) => void;
}

/** One bar: lifecycle tabs on the left (empty ones hidden), the type control on the right. */
export function IpoFilterBar({ group, type, groupCounts, typeCounts, onGroup, onType }: IpoFilterBarProps) {
  return (
    <div className={styles.bar}>
      <div className={styles.tabs} role="tablist" aria-label="IPO status">
        {visibleGroups(groupCounts, group).map((g) => (
          <button
            key={g}
            type="button"
            role="tab"
            aria-selected={g === group}
            className={`${styles.tab} ${g === group ? styles.tabActive : ''}`}
            onClick={() => onGroup(g)}
          >
            {GROUP_LABEL[g]} <span className={styles.count}>{groupCounts[g]}</span>
          </button>
        ))}
      </div>
      <div className={styles.types} role="group" aria-label="IPO type">
        {TYPES.map((t) => (
          <button
            key={t}
            type="button"
            aria-pressed={t === type}
            className={`${styles.type} ${t === type ? styles.typeActive : ''}`}
            onClick={() => onType(t)}
          >
            {TYPE_LABEL[t]} <span className={styles.count}>{typeCounts[t]}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

import type { KpiGridBlock } from '@/lib/research/blocks';
import styles from './blocks.module.css';

export function KpiGrid({ block }: { readonly block: KpiGridBlock }) {
  return (
    <div className={styles.kpiGrid}>
      {block.items.map((item) => (
        <div key={item.label} className={styles.kpi}>
          <span className={styles.kpiLabel}>{item.label}</span>
          <span className={styles.kpiValue}>{item.value}</span>
          {item.note && (
            <span className={styles.kpiNote} data-tone={item.tone ?? 'neutral'}>
              {item.note}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

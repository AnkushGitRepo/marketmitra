import type { ThesisBentoBlock } from '@/lib/research/blocks';
import styles from './blocks.module.css';

export function ThesisBento({ block }: { readonly block: ThesisBentoBlock }) {
  return (
    <div className={styles.bento}>
      {block.columns.map((col) => (
        <section key={col.title} className={styles.bentoCard} data-tone={col.tone}>
          <h3 className={styles.bentoTitle}>{col.title}</h3>
          <ul>
            {col.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

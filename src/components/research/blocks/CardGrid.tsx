import type { CardGridBlock } from '@/lib/research/blocks';
import styles from './blocks.module.css';

/** A tag that is exactly one of these is a severity and is coloured as one (the portfolio report's drawdowns and risk register). */
const SEVERITIES = new Set(['CRITICAL', 'MODERATE', 'NORMAL']);

/** A numbered checklist or a row of stages, as cards. */
export function CardGrid({ block }: { readonly block: CardGridBlock }) {
  return (
    <figure className={styles.cardGridWrap}>
      <figcaption className={styles.chartTitle}>{block.title}</figcaption>
      <ol className={styles.cardGrid} data-cols={block.columns}>
        {block.cards.map((card, i) => (
          <li key={`${i}-${card.heading}`} className={styles.gridCard}>
            {block.numbered && <span className={styles.cardNumber}>{String(i + 1).padStart(2, '0')}</span>}
            <span className={styles.cardHeading}>{card.heading}</span>
            {card.tag && <span className={styles.cardTag} data-severity={SEVERITIES.has(card.tag) ? card.tag : undefined}>{card.tag}</span>}
            {card.text && <span className={styles.cardText}>{card.text}</span>}
          </li>
        ))}
      </ol>
    </figure>
  );
}

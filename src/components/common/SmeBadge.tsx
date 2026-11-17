import styles from './SmeBadge.module.css';

/** Marks a company listed on the NSE SME platform: smaller, thinner-traded companies than the main board. */
export function SmeBadge() {
  return (
    <span className={styles.badge} title="Listed on the NSE SME platform: smaller company, thinner trading than the main board.">
      SME
    </span>
  );
}

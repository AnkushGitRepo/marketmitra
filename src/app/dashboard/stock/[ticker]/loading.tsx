import styles from './loading.module.css';

// Fresh (never-ingested) companies genuinely take several seconds to load —
// the page blocks on a Tier 1 -> Tier 3 fallback chain across several
// statement types before it can render anything. Without this, App Router
// shows nothing at all during that wait, which reads as a broken click.
export default function StockPageLoading() {
  return (
    <div className={styles.pageRoot}>
      <div className={styles.headRow}>
        <div className={styles.identity}>
          <div className={`${styles.skeleton} ${styles.logo}`} />
          <div>
            <div className={`${styles.skeleton} ${styles.title}`} />
            <div className={`${styles.skeleton} ${styles.subtitle}`} />
          </div>
        </div>
        <div>
          <div className={`${styles.skeleton} ${styles.price}`} />
          <div className={`${styles.skeleton} ${styles.change}`} />
        </div>
      </div>

      <div className={`${styles.skeleton} ${styles.card}`} />
      <div className={styles.splitGrid}>
        <div className={`${styles.skeleton} ${styles.cardTall}`} />
        <div className={`${styles.skeleton} ${styles.cardTall}`} />
      </div>
      <div className={`${styles.skeleton} ${styles.card}`} />
    </div>
  );
}

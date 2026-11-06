import styles from './loading.module.css';

// Shown instantly while a dashboard page's data loads. Pages like Dashboard and
// Portfolio fan out to several data sources, so without this the browser gets
// no HTML at all until the slowest one answers (seconds on a cold start). With
// it, the app shell and this skeleton stream first and the page fills in after.
// Routes with their own loading.tsx (e.g. the stock page) keep theirs.
export default function DashboardLoading() {
  return (
    <div className={styles.pageRoot} aria-busy="true" aria-label="Loading">
      <div className={`${styles.skeleton} ${styles.heading}`} />
      <div className={styles.statRow}>
        <div className={`${styles.skeleton} ${styles.stat}`} />
        <div className={`${styles.skeleton} ${styles.stat}`} />
        <div className={`${styles.skeleton} ${styles.stat}`} />
      </div>
      <div className={`${styles.skeleton} ${styles.chart}`} />
      <div className={styles.splitRow}>
        <div className={`${styles.skeleton} ${styles.panel}`} />
        <div className={`${styles.skeleton} ${styles.panel}`} />
      </div>
    </div>
  );
}

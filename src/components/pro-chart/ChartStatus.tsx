import styles from './ProChart.module.css';

/** Skeleton while price history is being recovered, or a clear error with a way to try again. */
export function ChartStatus({ status, onRetry }: { status: 'loading' | 'error'; onRetry: () => void }) {
  if (status === 'loading') {
    return (
      <div className={styles.statusBox} role="status" aria-live="polite">
        <span className={styles.spinner} aria-hidden="true" />
        <p className={styles.statusText}>Loading price history…</p>
      </div>
    );
  }
  return (
    <div className={styles.statusBox} role="alert">
      <p className={styles.statusTitle}>Price history isn&rsquo;t available right now</p>
      <p className={styles.statusText}>The data source didn&rsquo;t respond. Your holdings and quotes are unaffected.</p>
      <button type="button" className={styles.fallbackBtn} onClick={onRetry}>
        Retry
      </button>
    </div>
  );
}

'use client';

import { useState } from 'react';
import type { ComponentHealth, CronStatus, SystemStatus } from '@/lib/system/health';
import styles from './page.module.css';

interface Props {
  initialStatus: SystemStatus;
}

const STATUS_LABEL: Record<ComponentHealth['status'], string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  not_configured: 'Not configured',
};

const OVERALL_LABEL: Record<ComponentHealth['status'], string> = {
  operational: 'All systems operational',
  degraded: 'Degraded performance',
  down: 'Service disruption',
  not_configured: 'All systems operational',
};

function StatusDot({ status }: { status: ComponentHealth['status'] }) {
  return <span className={`${styles.dot} ${styles[`dot_${status}`]}`} aria-hidden="true" />;
}

function formatTs(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function StatusPageClient({ initialStatus }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/status', { cache: 'no-store' });
      const json = await res.json();
      if (json.success) setStatus(json.data);
    } catch {
      // leave the last known status on screen
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <main className={styles.content}>
      <div className={styles.headBanner}>
        <div className={styles.headBannerRow}>
          <h1 className={styles.title}>
            <StatusDot status={status.overall} />
            {OVERALL_LABEL[status.overall]}
          </h1>
          <button type="button" className={styles.refreshBtn} onClick={refresh} disabled={refreshing}>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
        <p className={styles.checkedAt}>Last checked {formatTs(status.checkedAt)}</p>
      </div>

      <div className={styles.componentList}>
        {status.components.map((c) => (
          <div key={c.id} className={styles.componentRow}>
            <div className={styles.componentRowLeft}>
              <StatusDot status={c.status} />
              <span className={styles.componentLabel}>{c.label}</span>
            </div>
            <div className={styles.componentRowRight}>
              {c.detail && <span className={styles.componentDetail}>{c.detail}</span>}
              <span className={`${styles.badge} ${styles[`badge_${c.status}`]}`}>{STATUS_LABEL[c.status]}</span>
            </div>
          </div>
        ))}
      </div>

      <h2 className={styles.sectionTitle}>Scheduled jobs</h2>
      <div className={styles.componentList}>
        {status.crons.map((c: CronStatus) => (
          <div key={c.id} className={styles.componentRow}>
            <div className={styles.componentRowLeft}>
              <span className={styles.componentLabel}>{c.label}</span>
            </div>
            <div className={styles.componentRowRight}>
              <span className={styles.componentDetail}>
                {c.lastRun ? `Last ran ${formatTs(c.lastRun.ts)}` : 'No runs recorded yet'}
              </span>
              {c.lastRun && (
                <span className={`${styles.badge} ${styles[`level_${c.lastRun.level}`]}`}>{c.lastRun.level}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      <p className={styles.footnote}>
        This page reflects live checks against MarketMitra&rsquo;s own infrastructure &mdash; no
        history is stored beyond the last 30 days of job activity shown above.
      </p>
    </main>
  );
}

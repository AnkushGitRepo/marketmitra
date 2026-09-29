'use client';

import { useState } from 'react';
import type { ComponentHealth, CronStatus, SystemStatus } from '@/lib/system/health';
import type { EventLevel, SystemEvent } from '@/lib/system/eventLog';
import styles from './page.module.css';

interface Props {
  initialStatus: SystemStatus;
  initialEvents: SystemEvent[];
}

const STATUS_LABEL: Record<ComponentHealth['status'], string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
  not_configured: 'Not configured',
};

function StatusPill({ status }: { status: ComponentHealth['status'] }) {
  return <span className={`${styles.pill} ${styles[`pill_${status}`]}`}>{STATUS_LABEL[status]}</span>;
}

function formatTs(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

const LEVELS: Array<EventLevel | 'all'> = ['all', 'info', 'warn', 'error'];

export function SystemPageClient({ initialStatus, initialEvents }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [refreshing, setRefreshing] = useState(false);

  const [events, setEvents] = useState(initialEvents);
  const [level, setLevel] = useState<EventLevel | 'all'>('all');
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [hasMore, setHasMore] = useState(initialEvents.length === 50);

  const refreshStatus = async () => {
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

  const loadLogs = async (opts: { level?: EventLevel | 'all'; before?: string } = {}) => {
    setLoadingLogs(true);
    try {
      const params = new URLSearchParams();
      const useLevel = opts.level ?? level;
      if (useLevel !== 'all') params.set('level', useLevel);
      if (opts.before) params.set('before', opts.before);
      params.set('limit', '50');
      const res = await fetch(`/api/system/logs?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!json.success) return;
      const batch: SystemEvent[] = json.data;
      setEvents((prev) => (opts.before ? [...prev, ...batch] : batch));
      setHasMore(batch.length === 50);
    } finally {
      setLoadingLogs(false);
    }
  };

  const changeLevel = (next: EventLevel | 'all') => {
    setLevel(next);
    void loadLogs({ level: next });
  };

  const loadMore = () => {
    const last = events[events.length - 1];
    if (last) void loadLogs({ before: new Date(last.ts).toISOString() });
  };

  return (
    <div className={styles.pageRoot}>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>Infrastructure</p>
          <h1 className={styles.h1}>System status</h1>
          <p className={styles.introNote}>
            Live health of every component this deployment depends on, plus the last 30 days of
            cron / job activity. The same checks power the public{' '}
            <a href="/status">/status</a> page.
          </p>
        </div>
        <button type="button" className={styles.refreshBtn} onClick={refreshStatus} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <p className={styles.checkedAt}>
        Overall: <StatusPill status={status.overall} /> &middot; checked {formatTs(status.checkedAt)}
      </p>

      <div className={styles.componentGrid}>
        {status.components.map((c) => (
          <div key={c.id} className={styles.componentCard}>
            <div className={styles.componentCardHead}>
              <span className={styles.componentLabel}>{c.label}</span>
              <StatusPill status={c.status} />
            </div>
            {c.detail && <p className={styles.componentDetail}>{c.detail}</p>}
            {typeof c.latencyMs === 'number' && (
              <p className={styles.componentLatency}>{c.latencyMs} ms</p>
            )}
          </div>
        ))}
      </div>

      <h2 className={styles.sectionTitle}>Scheduled jobs</h2>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Job</th>
              <th>Last run</th>
              <th>Result</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {status.crons.map((c: CronStatus) => (
              <tr key={c.id}>
                <td>{c.label}</td>
                <td>{c.lastRun ? formatTs(c.lastRun.ts) : 'No runs recorded yet'}</td>
                <td>
                  {c.lastRun ? (
                    <span className={`${styles.levelTag} ${styles[`level_${c.lastRun.level}`]}`}>
                      {c.lastRun.level}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
                <td>{c.lastRun?.durationMs != null ? `${c.lastRun.durationMs} ms` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.headRow}>
        <h2 className={styles.sectionTitle}>Event log</h2>
        <div className={styles.levelFilter}>
          {LEVELS.map((l) => (
            <button
              key={l}
              type="button"
              className={`${styles.filterBtn} ${level === l ? styles.filterBtnActive : ''}`}
              onClick={() => changeLevel(l)}
            >
              {l === 'all' ? 'All' : l}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Time</th>
              <th>Level</th>
              <th>Source</th>
              <th>Message</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td>{formatTs(e.ts)}</td>
                <td>
                  <span className={`${styles.levelTag} ${styles[`level_${e.level}`]}`}>{e.level}</span>
                </td>
                <td className={styles.mono}>{e.source}</td>
                <td>{e.message}</td>
                <td>{e.durationMs != null ? `${e.durationMs} ms` : '—'}</td>
              </tr>
            ))}
            {events.length === 0 && (
              <tr>
                <td colSpan={5} className={styles.emptyRow}>
                  {loadingLogs ? 'Loading…' : 'No events recorded yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <button type="button" className={styles.loadMoreBtn} onClick={loadMore} disabled={loadingLogs}>
          {loadingLogs ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

'use client';

import Link from 'next/link';
import type { Notification } from '@/lib/notifications/types';
import { alertSeverity, selectCriticalAlerts } from '@/lib/dashboard/criticalAlerts';
import { relativeTime } from '@/lib/dashboard/relativeTime';
import { tagsForActivity } from '@/lib/dashboard/activityTags';
import styles from './CriticalAlertsCard.module.css';

interface CriticalAlertsCardProps {
  readonly items: readonly Notification[];
  /** Passed in so the selection is deterministic and testable. */
  readonly now: Date;
}

const SEVERITY_LABEL = { critical: 'Critical', warning: 'Warning' } as const;

/** Triggered stop-loss and price alerts from the last week, surfaced beside the portfolio instead of at the page bottom. */
export function CriticalAlertsCard({ items, now }: CriticalAlertsCardProps) {
  const alerts = selectCriticalAlerts(items, now);

  return (
    <section className={styles.card} aria-label="Critical alerts">
      <div className={styles.head}>
        <h2 className={styles.title}>Critical alerts</h2>
        <Link href="/alerts" className={styles.link}>
          All alerts →
        </Link>
      </div>
      {alerts.length === 0 ? (
        <p className={styles.empty}>No triggered alerts in the last 7 days.</p>
      ) : (
        <ul className={styles.list}>
          {alerts.map((a) => {
            const severity = alertSeverity(a);
            const tag = tagsForActivity(a)[0];
            const body = (
              <>
                <div className={styles.meta}>
                  <span className={`${styles.pill} ${severity === 'critical' ? styles.pillCritical : styles.pillWarning}`}>
                    {SEVERITY_LABEL[severity]}
                  </span>
                  {tag && <span className={styles.tag}>{tag}</span>}
                  <span className={styles.time}>{relativeTime(a.createdAt)}</span>
                </div>
                <p className={styles.itemTitle}>{a.title}</p>
              </>
            );
            return (
              <li key={a.id} className={`${styles.item} ${severity === 'critical' ? styles.itemCritical : styles.itemWarning}`}>
                {a.href ? (
                  <Link href={a.href} className={styles.itemLink}>
                    {body}
                  </Link>
                ) : (
                  <div className={styles.itemLink}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

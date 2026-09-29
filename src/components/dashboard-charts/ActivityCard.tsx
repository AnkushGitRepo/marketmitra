'use client';

import Link from 'next/link';
import type { Notification } from '@/lib/notifications/types';
import { relativeTime } from '@/lib/dashboard/relativeTime';
import { tagsForActivity } from '@/lib/dashboard/activityTags';
import styles from './ActivityCard.module.css';

interface ActivityCardProps {
  /** Recent `kind: 'alert' | 'system'` notifications, newest first — the
   * caller trims to a handful (page.tsx fetches via `listNotifications`). */
  items: Notification[];
  /** Optional heading override; defaults to "Recent activity". */
  title?: string;
}

function tagClass(tag: string): string {
  if (tag === 'STOP-LOSS' || tag === 'DRAWDOWN') return styles.tagRisk;
  if (tag === 'MITRA AUTO') return styles.tagMitra;
  return styles.tagNeutral;
}

export function ActivityCard({ items, title = 'Recent activity' }: ActivityCardProps) {
  if (items.length === 0) return null;

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <p className={styles.title}>{title}</p>
        <Link href="/dashboard/alerts" className={styles.viewAll}>
          View all alerts →
        </Link>
      </div>
      <ul className={styles.list}>
        {items.map((item) => {
          const tags = tagsForActivity(item);
          const body = (
            <>
              <div className={styles.rowHead}>
                {tags.map((tag) => (
                  <span key={tag} className={`${styles.tag} ${tagClass(tag)}`}>
                    {tag}
                  </span>
                ))}
                <span className={styles.time}>{relativeTime(item.createdAt)}</span>
              </div>
              <p className={styles.itemTitle}>{item.title}</p>
              <p className={styles.itemBody}>{item.body}</p>
            </>
          );
          return (
            <li key={item.id} className={styles.item}>
              {item.href ? (
                <Link href={item.href} className={styles.itemLink}>
                  {body}
                </Link>
              ) : (
                <div className={styles.itemLink}>{body}</div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

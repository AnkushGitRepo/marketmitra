'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useNotifications, type NotificationItem } from './NotificationsProvider';
import styles from './NotificationBell.module.css';

function relative(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

/** `goTo`: instead of the dropdown, tapping the bell navigates there (mobile header → Alerts). */
export function NotificationBell({ goTo }: { goTo?: string } = {}) {
  const router = useRouter();
  const { items, unread, reload } = useNotifications();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const markRead = async (body: object) => {
    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch {
      /* ignore */
    }
    reload();
  };

  const onItemClick = async (item: NotificationItem) => {
    if (!item.read) await markRead({ id: item.id });
    setOpen(false);
    if (item.href) router.push(item.href);
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.bellButton}
        // The visible badge text ("9+") must appear in the accessible name.
        aria-label={unread > 0 ? `Notifications, ${unread > 9 ? '9+' : unread} unread` : 'Notifications'}
        onClick={() => (goTo ? router.push(goTo) : setOpen((v) => !v))}
      >
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M10 2.5a5 5 0 0 0-5 5v2.6l-1.3 2.5a.9.9 0 0 0 .8 1.3h11a.9.9 0 0 0 .8-1.3L15 10.1V7.5a5 5 0 0 0-5-5Z"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
          <path d="M8 16.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        {unread > 0 && <span className={styles.badge}>{unread > 9 ? '9+' : unread}</span>}
      </button>

      {open && !goTo && (
        <div className={styles.panel} role="menu">
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>Notifications</span>
            {unread > 0 && (
              <button type="button" className={styles.markAll} onClick={() => markRead({ all: true })}>
                Mark all read
              </button>
            )}
          </div>
          {items.length === 0 ? (
            <p className={styles.empty}>Nothing yet. Alerts you set will show up here.</p>
          ) : (
            <ul className={styles.list}>
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`${styles.item} ${item.read ? '' : styles.itemUnread}`}
                    onClick={() => onItemClick(item)}
                  >
                    <span className={styles.itemTitle}>{item.title}</span>
                    <span className={styles.itemBody}>{item.body}</span>
                    <span className={styles.itemTime}>{relative(item.createdAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

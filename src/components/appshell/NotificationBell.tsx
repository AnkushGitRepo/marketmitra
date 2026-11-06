'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import styles from './NotificationBell.module.css';

interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
}

const POLL_MS = 60_000;

function relative(iso: string): string {
  const secs = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.round(hrs / 24)}d`;
}

export function NotificationBell() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  // A failed poll is a no-op for a header widget — the next tick retries.
  // setState lives inside the `.then` callback (not synchronously in an
  // effect) — same pattern as useSymbolSearch.
  const load = (signal?: AbortSignal) => {
    fetch('/api/notifications?limit=20', { cache: 'no-store', signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!payload) return;
        setItems(payload.data ?? []);
        setUnread(payload.meta?.unread ?? 0);
      })
      .catch(() => {});
  };

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    const timer = setInterval(() => load(controller.signal), POLL_MS);
    const onFocus = () => load(controller.signal);
    window.addEventListener('focus', onFocus);
    return () => {
      controller.abort();
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, []);

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
    load();
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
        onClick={() => setOpen((v) => !v)}
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

      {open && (
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

'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export interface NotificationItem {
  id: string;
  kind: string;
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
}

interface NotificationsValue {
  items: NotificationItem[];
  unread: number;
  reload: () => void;
}

const POLL_MS = 60_000;

const NotificationsContext = createContext<NotificationsValue>({ items: [], unread: 0, reload: () => {} });

export const useNotifications = () => useContext(NotificationsContext);

/** The single owner of the notifications fetch + poll. AppHeader mounts a
 * desktop and a mobile header (CSS hides one), each with a bell — if each bell
 * fetched for itself that was two identical requests, two timers and two focus
 * listeners per page load, and marking one read left the other stale. */
export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);

  // A failed poll is a no-op for a header widget — the next tick retries.
  // setState lives inside the `.then` callback (not synchronously in an
  // effect) — same pattern as useSymbolSearch.
  const load = useCallback((signal?: AbortSignal) => {
    fetch('/api/notifications?limit=20', { cache: 'no-store', signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (!payload) return;
        setItems(payload.data ?? []);
        setUnread(payload.meta?.unread ?? 0);
      })
      .catch(() => {});
  }, []);

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
  }, [load]);

  const reload = useCallback(() => load(), [load]);
  const value = useMemo(() => ({ items, unread, reload }), [items, unread, reload]);

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

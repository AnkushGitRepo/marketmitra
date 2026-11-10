'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { UIMessage } from 'ai';
import { useSearchParams } from 'next/navigation';
import { ChatThread } from './ChatThread';
import { ConversationRail } from './ConversationRail';
import { mitraApi, type ConversationDto } from './api';
import { useConversations } from './useConversations';
import { usePersistedFlag } from './usePersistedFlag';
import styles from './MitraChat.module.css';

type View =
  | { readonly kind: 'new'; readonly nonce: number }
  | { readonly kind: 'loading'; readonly id: string }
  | { readonly kind: 'ready'; readonly id: string; readonly messages: readonly UIMessage[] }
  | { readonly kind: 'missing' };

/** Keeps `?c=<id>` in the address bar without a Next navigation (which would remount the live thread). */
function syncUrl(id: string | null) {
  const url = new URL(window.location.href);
  if (id) url.searchParams.set('c', id);
  else url.searchParams.delete('c');
  window.history.replaceState(null, '', url);
}

export function MitraChatClient() {
  const initialId = useSearchParams().get('c');
  const [view, setView] = useState<View>(initialId ? { kind: 'loading', id: initialId } : { kind: 'new', nonce: 0 });
  const [railOpen, setRailOpen] = useState(false);
  const conversations = useConversations();
  const [railCollapsed, setRailCollapsed] = usePersistedFlag('mm-mitra-rail-collapsed');
  const nonce = useRef(1);
  // Bumped on every navigation so a slow response for an earlier choice cannot overwrite the current view.
  const navTicket = useRef(0);
  const [createdId, setCreatedId] = useState<string | null>(null);

  // Promise chain (not async/await) so the state updates happen in callbacks, which is
  // what the effect below needs to stay free of synchronous setState.
  const load = useCallback((id: string) => {
    const ticket = ++navTicket.current;
    return mitraApi
      .get(id)
      .then(({ messages }) => {
        if (ticket !== navTicket.current) return;
        setView({ kind: 'ready', id, messages });
        syncUrl(id);
      })
      .catch(() => {
        if (ticket !== navTicket.current) return;
        setView({ kind: 'missing' });
        syncUrl(null);
      });
  }, []);

  const open = useCallback(
    (id: string) => {
      setView({ kind: 'loading', id });
      setRailOpen(false);
      void load(id);
    },
    [load]
  );

  // A deep link (`?c=<id>`) starts in the `loading` view, so only the fetch runs here.
  useEffect(() => {
    if (initialId) void load(initialId);
    // Mount-only on purpose; later selection goes through `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startNew = useCallback(() => {
    navTicket.current += 1;
    setCreatedId(null);
    setView({ kind: 'new', nonce: nonce.current++ });
    setRailOpen(false);
    syncUrl(null);
  }, []);

  const handleCreated = useCallback(
    (c: ConversationDto) => {
      setCreatedId(c.id);
      conversations.add(c);
      syncUrl(c.id);
    },
    // `add` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [conversations.add]
  );

  const activeId = view.kind === 'ready' || view.kind === 'loading' ? view.id : view.kind === 'new' ? createdId : null;
  const activeTitle = conversations.items.find((c) => c.id === activeId)?.title ?? 'New chat';

  const handleDelete = async (id: string) => {
    await conversations.remove(id);
    if (id === activeId) startNew();
  };

  return (
    <div
      className={`${styles.shell} ${railCollapsed ? styles.shellCollapsed : ''} ${railCollapsed === null ? styles.shellPending : ''}`}
      data-fill-viewport
    >
      <h1 className={styles.srOnly}>Mitra chat</h1>
      <button type="button" className={styles.railToggle} onClick={() => setRailOpen((o) => !o)} aria-expanded={railOpen}>
        {railOpen ? 'Close history' : 'History'}
      </button>
      <aside id="mitra-chat-rail" className={`${styles.rail} ${railOpen ? styles.railOpen : ''}`}>
        <ConversationRail
          items={conversations.items}
          activeId={activeId}
          loading={conversations.loading}
          error={conversations.error}
          query={conversations.query}
          onQuery={conversations.setQuery}
          onSelect={open}
          onNew={startNew}
          onRename={conversations.rename}
          onDelete={handleDelete}
        />
      </aside>

      <div className={styles.main}>
        <header className={styles.bar}>
          <button
            type="button"
            className={styles.collapseBtn}
            onClick={() => setRailCollapsed(!railCollapsed)}
            aria-expanded={!railCollapsed}
            aria-controls="mitra-chat-rail"
            aria-label={railCollapsed ? 'Show chat list' : 'Hide chat list'}
            title={railCollapsed ? 'Show chat list' : 'Hide chat list'}
          >
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <rect x="2.5" y="3.5" width="15" height="13" rx="3" stroke="currentColor" strokeWidth="1.6" />
              <path d="M8 3.5v13" stroke="currentColor" strokeWidth="1.6" />
              {!railCollapsed && <rect x="3.6" y="4.6" width="3.3" height="10.8" rx="1.4" fill="currentColor" opacity="0.25" />}
            </svg>
          </button>
          <span className={styles.barTitle}>{activeTitle}</span>
        </header>
        {view.kind === 'loading' && <p className={styles.status}>Loading conversation…</p>}
        {view.kind === 'missing' && (
          <div className={styles.status}>
            <p>That conversation no longer exists.</p>
            <button type="button" className={styles.linkButton} onClick={startNew}>
              Start a new chat
            </button>
          </div>
        )}
        {view.kind === 'new' && (
          <ChatThread
            key={`new-${view.nonce}`}
            initialConversationId={null}
            initialMessages={[]}
            onConversationCreated={handleCreated}
            onActivity={conversations.refresh}
          />
        )}
        {view.kind === 'ready' && (
          <ChatThread
            key={view.id}
            initialConversationId={view.id}
            initialMessages={view.messages}
            onConversationCreated={handleCreated}
            onActivity={conversations.refresh}
          />
        )}
      </div>
    </div>
  );
}

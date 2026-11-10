'use client';

import { useMemo, useState } from 'react';
import { groupByRecency } from '@/lib/mitra-chat/uiHelpers';
import type { ConversationDto } from './api';
import styles from './Rail.module.css';

interface ConversationRailProps {
  readonly items: readonly ConversationDto[];
  readonly activeId: string | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly query: string;
  readonly onQuery: (q: string) => void;
  readonly onSelect: (id: string) => void;
  readonly onNew: () => void;
  readonly onRename: (id: string, title: string) => Promise<void>;
  readonly onDelete: (id: string) => Promise<void>;
}

export function ConversationRail({ items, activeId, loading, error, query, onQuery, onSelect, onNew, onRename, onDelete }: ConversationRailProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [confirming, setConfirming] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const groups = useMemo(() => groupByRecency(items, new Date()), [items]);

  const run = async (action: () => Promise<void>) => {
    setActionError(null);
    try {
      await action();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'That did not work. Try again.');
    }
  };

  const commitRename = (id: string, original: string) => {
    const title = draft.trim();
    setEditing(null);
    if (title && title !== original) void run(() => onRename(id, title));
  };

  return (
    <nav className={styles.rail} aria-label="Conversations">
      <button type="button" className={styles.newChat} onClick={onNew}>
        <span aria-hidden="true">＋</span> New chat
      </button>
      <input
        type="search"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        placeholder="Search chats"
        aria-label="Search conversations"
        className={styles.search}
      />

      <div className={styles.list}>
        {loading && items.length === 0 && <p className={styles.note}>Loading…</p>}
        {error && <p className={styles.noteError}>{error}</p>}
        {!loading && !error && items.length === 0 && (
          <p className={styles.note}>{query ? 'No chats match that search.' : 'Your conversations will appear here.'}</p>
        )}
        {groups.map((group) => (
          <section key={group.label} aria-label={group.label}>
            <h3 className={styles.groupLabel}>{group.label}</h3>
            <ul className={styles.items}>
              {group.items.map((c) => (
                <li key={c.id} className={`${styles.item} ${c.id === activeId ? styles.itemActive : ''}`}>
                  {editing === c.id ? (
                    <input
                      autoFocus
                      className={styles.renameInput}
                      value={draft}
                      maxLength={80}
                      aria-label="Conversation title"
                      onChange={(e) => setDraft(e.target.value)}
                      onBlur={() => commitRename(c.id, c.title)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') commitRename(c.id, c.title);
                        if (e.key === 'Escape') setEditing(null);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className={styles.itemButton}
                      onClick={() => onSelect(c.id)}
                      onDoubleClick={() => {
                        setDraft(c.title);
                        setEditing(c.id);
                      }}
                      aria-current={c.id === activeId ? 'true' : undefined}
                      title={c.title}
                    >
                      {c.title}
                    </button>
                  )}
                  {confirming === c.id ? (
                    <span className={styles.confirm}>
                      <button
                        type="button"
                        className={styles.confirmYes}
                        onClick={() => {
                          setConfirming(null);
                          void run(() => onDelete(c.id));
                        }}
                      >
                        Delete
                      </button>
                      <button type="button" className={styles.confirmNo} onClick={() => setConfirming(null)}>
                        Keep
                      </button>
                    </span>
                  ) : (
                    editing !== c.id && (
                      <span className={styles.actions}>
                        <button
                          type="button"
                          className={styles.action}
                          aria-label={`Rename ${c.title}`}
                          onClick={() => {
                            setDraft(c.title);
                            setEditing(c.id);
                          }}
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="m11 2.5 2.5 2.5-8 8H3v-2.5l8-8Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
                          </svg>
                        </button>
                        <button type="button" className={styles.action} aria-label={`Delete ${c.title}`} onClick={() => setConfirming(c.id)}>
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                            <path d="M3 4.5h10M6.5 4.5V3h3v1.5M5 4.5l.5 8h5l.5-8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </button>
                      </span>
                    )
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))}
        {actionError && <p className={styles.noteError}>{actionError}</p>}
      </div>
    </nav>
  );
}

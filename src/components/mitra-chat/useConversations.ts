'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { mitraApi, type ConversationDto } from './api';

const SEARCH_DEBOUNCE_MS = 250;

export function useConversations() {
  const [items, setItems] = useState<readonly ConversationDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  // Ignore responses from a superseded request (fast typing, rapid refreshes).
  const latest = useRef(0);

  const load = useCallback(async (q: string) => {
    const ticket = ++latest.current;
    try {
      const next = await mitraApi.list(q || undefined);
      if (ticket === latest.current) {
        setItems(next);
        setError(null);
      }
    } catch (e) {
      if (ticket === latest.current) setError(e instanceof Error ? e.message : 'Could not load chats.');
    } finally {
      if (ticket === latest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(query), query ? SEARCH_DEBOUNCE_MS : 0);
    return () => clearTimeout(timer);
  }, [query, load]);

  const refresh = useCallback(() => load(query), [load, query]);

  const add = useCallback((conversation: ConversationDto) => {
    setItems((all) => [conversation, ...all.filter((c) => c.id !== conversation.id)]);
  }, []);

  const rename = useCallback(async (id: string, title: string) => {
    const updated = await mitraApi.rename(id, title);
    setItems((all) => all.map((c) => (c.id === id ? updated : c)));
  }, []);

  const remove = useCallback(async (id: string) => {
    await mitraApi.remove(id);
    setItems((all) => all.filter((c) => c.id !== id));
  }, []);

  return { items, loading, error, query, setQuery, refresh, add, rename, remove };
}

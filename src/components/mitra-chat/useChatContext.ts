'use client';

import { useEffect, useState } from 'react';
import type { ChatContext } from '@/lib/mitra-chat/context';

export type ChatContextState =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly context: ChatContext }
  | { readonly status: 'error' };

/** Loads the greeting context (first name and live-priced holdings) once. Errors degrade to the generic empty state. */
export function useChatContext(): ChatContextState {
  const [state, setState] = useState<ChatContextState>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/mitra/context', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('unavailable'))))
      .then((body: { success?: boolean; data?: ChatContext }) => {
        if (body.success && body.data) setState({ status: 'ready', context: body.data });
        else setState({ status: 'error' });
      })
      .catch((e: unknown) => {
        if (!(e instanceof DOMException && e.name === 'AbortError')) setState({ status: 'error' });
      });
    return () => controller.abort();
  }, []);

  return state;
}

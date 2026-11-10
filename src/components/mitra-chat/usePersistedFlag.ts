'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { parseStoredFlag } from '@/lib/mitra-chat/uiHelpers';

const EVENT = 'mm-flag-change';

function subscribe(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/**
 * A boolean remembered in localStorage. Returns `null` on the server and during hydration so callers can
 * hide UI until the real value is known, instead of flashing the wrong layout.
 */
export function usePersistedFlag(key: string): readonly [boolean | null, (next: boolean) => void] {
  const value = useSyncExternalStore<boolean | null>(
    subscribe,
    () => {
      try {
        return parseStoredFlag(localStorage.getItem(key));
      } catch {
        return false; // storage blocked: behave as "off"
      }
    },
    () => null
  );

  const set = useCallback(
    (next: boolean) => {
      try {
        localStorage.setItem(key, next ? '1' : '0');
      } catch {
        // Best-effort persistence only.
      }
      window.dispatchEvent(new Event(EVENT));
    },
    [key]
  );

  return [value, set] as const;
}

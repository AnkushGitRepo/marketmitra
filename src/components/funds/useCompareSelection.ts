'use client';

import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { MAX_COMPARE, parseStoredSelection, toggleSelection, type CompareItem } from '@/lib/funds/compare';

// The funds picked for comparison live for the browser tab (sessionStorage), so they survive the trip to a fund
// page and back. A tiny shared store keeps every checkbox, the dock and the compare buttons in step.
const STORAGE_KEY = 'marketmitra:funds:compare';

let current: string | null = null;
const listeners = new Set<() => void>();

function readStored(): string {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return ''; // storage blocked: the selection then lives only in memory
  }
}

function getSnapshot(): string {
  if (current === null) current = readStored();
  return current;
}

function getServerSnapshot(): string {
  return '';
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function save(items: readonly CompareItem[]): void {
  current = items.length > 0 ? JSON.stringify(items) : '';
  try {
    if (current) window.sessionStorage.setItem(STORAGE_KEY, current);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Not persisted; still shared in memory for this page.
  }
  listeners.forEach((listener) => listener());
}

export interface CompareSelection {
  readonly selected: readonly CompareItem[];
  readonly isFull: boolean;
  has: (schemeCode: number) => boolean;
  /** Adds or removes a fund; returns true when it could not be added because three are already picked. */
  toggle: (item: CompareItem) => boolean;
  remove: (schemeCode: number) => void;
  /** Make `items` the selection (the compare page does this so its URL and the dock agree). */
  replace: (items: readonly CompareItem[]) => void;
  clear: () => void;
}

export function useCompareSelection(): CompareSelection {
  const raw = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const selected = useMemo(() => parseStoredSelection(raw), [raw]);

  const toggle = useCallback((item: CompareItem) => {
    const result = toggleSelection(parseStoredSelection(getSnapshot()), item);
    if (!result.blocked) save(result.selected);
    return result.blocked;
  }, []);
  const remove = useCallback((schemeCode: number) => {
    save(parseStoredSelection(getSnapshot()).filter((s) => s.scheme_code !== schemeCode));
  }, []);
  const clear = useCallback(() => save([]), []);
  const replace = useCallback((items: readonly CompareItem[]) => {
    const next = parseStoredSelection(JSON.stringify(items));
    if (JSON.stringify(next) !== (getSnapshot() || '[]')) save(next);
  }, []);
  const has = useCallback((schemeCode: number) => selected.some((s) => s.scheme_code === schemeCode), [selected]);

  return { selected, isFull: selected.length >= MAX_COMPARE, has, toggle, remove, replace, clear };
}

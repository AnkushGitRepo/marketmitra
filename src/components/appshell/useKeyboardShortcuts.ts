'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useSyncExternalStore } from 'react';
import {
  IDLE_STATE,
  detectMac,
  isEditableTarget,
  resolveKey,
  type ChordState,
} from '@/lib/shortcuts/shortcuts';

/** Marks the header search input so the shortcut can find it without prop plumbing. */
export const SEARCH_INPUT_ATTR = 'data-global-search';

const noopSubscribe = () => () => {};

/** Client-only platform check; the server snapshot is non-Mac so hydration stays consistent. */
export function useIsMac(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => detectMac({ platform: navigator.platform, userAgent: navigator.userAgent }),
    () => false,
  );
}

function focusSearch(): boolean {
  const input = document.querySelector<HTMLInputElement>(`[${SEARCH_INPUT_ATTR}]`);
  // offsetParent is null when the (desktop-only) header is hidden, e.g. on mobile.
  if (!input || input.offsetParent === null) return false;
  input.focus();
  input.select();
  return true;
}

interface UseKeyboardShortcutsOptions {
  readonly helpOpen: boolean;
  readonly onToggleHelp: () => void;
}

export function useKeyboardShortcuts({ helpOpen, onToggleHelp }: UseKeyboardShortcutsOptions): void {
  const router = useRouter();
  const isMac = useIsMac();
  const chord = useRef<ChordState>(IDLE_STATE);
  // Latest props live in a ref so the window listener is attached once.
  const latest = useRef({ helpOpen, onToggleHelp, router, isMac });
  useEffect(() => {
    latest.current = { helpOpen, onToggleHelp, router, isMac };
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.repeat) return;
      const { helpOpen: help, onToggleHelp: toggle, router: r, isMac: mac } = latest.current;

      const result = resolveKey(
        chord.current,
        {
          key: e.key,
          metaKey: e.metaKey,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          editable: isEditableTarget(e.target as HTMLElement | null),
          dialogOpen: document.querySelector('dialog[open]') !== null,
          helpOpen: help,
          isMac: mac,
        },
        Date.now(),
      );
      chord.current = result.state;

      switch (result.action.type) {
        case 'focus-search':
          if (focusSearch()) e.preventDefault();
          break;
        case 'toggle-help':
          e.preventDefault();
          toggle();
          break;
        case 'navigate':
          e.preventDefault();
          r.push(result.action.href);
          break;
        case 'none':
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}

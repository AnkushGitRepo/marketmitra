/** Dispatched on `window` by anything that wants the shortcut sheet open (the Settings "View all shortcuts" button). */
export const OPEN_SHORTCUTS_EVENT = 'mm:open-shortcuts';

export interface GoToShortcut {
  /** Second key of the "G then <key>" chord, lower-case. */
  readonly key: string;
  readonly href: string;
  readonly label: string;
}

export const GO_TO_SHORTCUTS: readonly GoToShortcut[] = [
  { key: 'd', href: '/dashboard', label: 'Dashboard' },
  { key: 'p', href: '/portfolio', label: 'Portfolio' },
  { key: 'm', href: '/markets', label: 'Markets' },
  { key: 'c', href: '/mitra', label: 'Mitra chat' },
  { key: 's', href: '/settings', label: 'Settings' },
];

/** How long the second key of a chord may lag the first. */
export const CHORD_TIMEOUT_MS = 1200;

const CHORD_LEADER = 'g';

export interface ChordState {
  /** Timestamp the leader key was pressed, or null when no chord is pending. */
  readonly armedAt: number | null;
}

export const IDLE_STATE: ChordState = { armedAt: null };

export interface KeyInput {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  /** The event target is a text-entry element. */
  readonly editable: boolean;
  /** Any modal dialog is open. */
  readonly dialogOpen: boolean;
  /** The shortcut-help dialog is the one that is open. */
  readonly helpOpen: boolean;
  readonly isMac: boolean;
}

export type KeyAction =
  | { readonly type: 'none' }
  | { readonly type: 'focus-search' }
  | { readonly type: 'toggle-help' }
  | { readonly type: 'navigate'; readonly href: string };

export interface KeyResult {
  readonly state: ChordState;
  readonly action: KeyAction;
}

const NONE: KeyAction = { type: 'none' };

/** Pure keyboard-shortcut reducer: (chord state, key press, clock) -> (new state, action). */
export function resolveKey(state: ChordState, input: KeyInput, now: number): KeyResult {
  const key = input.key.toLowerCase();
  const modKey = input.isMac ? input.metaKey : input.ctrlKey;

  if (modKey && !input.altKey && key === 'k') {
    return { state: IDLE_STATE, action: input.dialogOpen ? NONE : { type: 'focus-search' } };
  }

  if (input.editable || input.metaKey || input.ctrlKey || input.altKey) {
    return { state: IDLE_STATE, action: NONE };
  }

  if (input.key === '?') {
    const allowed = !input.dialogOpen || input.helpOpen;
    return { state: IDLE_STATE, action: allowed ? { type: 'toggle-help' } : NONE };
  }

  if (input.dialogOpen) return { state: IDLE_STATE, action: NONE };

  if (state.armedAt !== null && now - state.armedAt <= CHORD_TIMEOUT_MS) {
    const target = GO_TO_SHORTCUTS.find((s) => s.key === key);
    if (target) return { state: IDLE_STATE, action: { type: 'navigate', href: target.href } };
  }

  if (key === CHORD_LEADER) return { state: { armedAt: now }, action: NONE };
  return { state: IDLE_STATE, action: NONE };
}

export function isEditableTarget(target: { tagName: string; isContentEditable?: boolean } | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName.toUpperCase());
}

/** "G then P" for routes that have a go-to chord, otherwise undefined. */
export function shortcutHintFor(href: string): string | undefined {
  const match = GO_TO_SHORTCUTS.find((s) => s.href === href);
  return match ? `${CHORD_LEADER.toUpperCase()} then ${match.key.toUpperCase()}` : undefined;
}

export function detectMac(nav: { platform?: string; userAgent?: string }): boolean {
  return /mac|iphone|ipad/i.test(nav.platform || nav.userAgent || '');
}

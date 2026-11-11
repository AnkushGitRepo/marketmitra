// The Settings hub's tabs and how a URL picks one. Pure.

export type SettingsTab = 'account' | 'ai' | 'preferences' | 'alerts' | 'data';

export interface TabDef {
  readonly id: SettingsTab;
  readonly label: string;
}

/** In display order. */
export const SETTINGS_TABS: readonly TabDef[] = [
  { id: 'account', label: 'Account' },
  { id: 'ai', label: 'AI & Models' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'alerts', label: 'Alerts & Channels' },
  { id: 'data', label: 'Data & Privacy' },
];

export const DEFAULT_TAB: SettingsTab = 'account';

const isTab = (v: string | null | undefined): v is SettingsTab => SETTINGS_TABS.some((t) => t.id === v);

/**
 * The page used to be one scroll with these anchors, and links in the wild still use them (the designed emails link to
 * `/settings#notifications`), so each old anchor opens the tab that now holds that content.
 */
const LEGACY_ANCHORS: Record<string, SettingsTab> = {
  account: 'account',
  about: 'account',
  ai: 'ai',
  chat: 'preferences',
  display: 'preferences',
  shortcuts: 'preferences',
  notifications: 'alerts',
  data: 'data',
};

/** The tab for a `?tab=` value and/or a `#hash`. The explicit query wins; anything unknown falls back to the default. */
export function resolveTab({ query, hash }: { readonly query?: string | null; readonly hash?: string | null }): SettingsTab {
  if (isTab(query)) return query;
  const anchor = (hash ?? '').replace(/^#/, '');
  if (isTab(anchor)) return anchor;
  return LEGACY_ANCHORS[anchor] ?? DEFAULT_TAB;
}

/** The next tab for an arrow-key press (wrapping), or null for any other key. Home and End jump to the ends. */
export function tabAfterKey(current: SettingsTab, key: string): SettingsTab | null {
  const ids = SETTINGS_TABS.map((t) => t.id);
  const i = ids.indexOf(current);
  if (key === 'ArrowRight') return ids[(i + 1) % ids.length];
  if (key === 'ArrowLeft') return ids[(i - 1 + ids.length) % ids.length];
  if (key === 'Home') return ids[0];
  if (key === 'End') return ids[ids.length - 1];
  return null;
}

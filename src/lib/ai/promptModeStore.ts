// Server-side resolution of Mitra's prompt mode for a user (ADR 0054). Enforced here, never in the UI:
// the hosted site is always guarded, and any failure to read the setting also means guarded.

import { isHosted } from '@/lib/deployment-mode';
import { getPreferences } from '@/lib/preferences/store';
import { selectPromptMode, type PromptMode } from './promptMode';

export async function resolvePromptMode(userId: string): Promise<PromptMode> {
  if (isHosted()) return 'guarded';
  try {
    const prefs = await getPreferences(userId);
    return selectPromptMode({ hosted: false, unrestricted: prefs.chat.unrestricted === true });
  } catch {
    return 'guarded';
  }
}

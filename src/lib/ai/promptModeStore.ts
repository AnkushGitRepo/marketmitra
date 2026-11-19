// Server-side resolution of Mitra's prompt mode for a user (ADR 0054, 0070). Enforced here, never in the UI: a hosted user who is not an
// admin is always guarded (the stored setting is not even read), and any failure to read the setting also means guarded.

import { canUsePrivilegedModes } from '@/lib/auth/privilegedModes';
import { getPreferences } from '@/lib/preferences/store';
import { selectPromptMode, type PromptMode } from './promptMode';

export async function resolvePromptMode(userId: string): Promise<PromptMode> {
  if (!canUsePrivilegedModes(userId)) return 'guarded';
  try {
    const prefs = await getPreferences(userId);
    return selectPromptMode({ hosted: false, unrestricted: prefs.chat.unrestricted === true });
  } catch {
    return 'guarded';
  }
}

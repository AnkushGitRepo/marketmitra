'use client';

import { useCallback, useState } from 'react';
import type { Preferences, PreferencesPatch } from '@/lib/preferences/schema';

/** Optimistic preference updates: the control flips at once and rolls back with a message if the save fails. */
export function usePreferences(initial: Preferences) {
  const [prefs, setPrefs] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const save = useCallback(
    async (patch: PreferencesPatch) => {
      const previous = prefs;
      setError(null);
      setSaved(false);
      setPrefs({
        chat: { ...prefs.chat, ...patch.chat },
        display: { ...prefs.display, ...patch.display },
        shortcuts: { ...prefs.shortcuts, ...patch.shortcuts },
        agents: { ...prefs.agents, ...patch.agents },
      });
      try {
        const res = await fetch('/api/settings/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        const body = (await res.json().catch(() => null)) as { data?: Preferences; error?: string } | null;
        if (!res.ok || !body?.data) throw new Error(body?.error ?? 'Could not save.');
        setPrefs(body.data);
        setSaved(true);
      } catch (e) {
        setPrefs(previous);
        setError(e instanceof Error ? e.message : 'Could not save.');
      }
    },
    [prefs]
  );

  return { prefs, save, error, saved };
}

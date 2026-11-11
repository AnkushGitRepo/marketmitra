import { z } from 'zod';

// Per-user preferences (ADR 0038). Every field has a default, so an empty stored
// document, a partial one, or an unknown future one all resolve to something valid.

export const DICTATION_LANGUAGES = ['auto', 'en-IN', 'en-US', 'en-GB', 'hi-IN'] as const;

export const preferencesSchema = z.object({
  chat: z.object({
    /** Let Mitra read the platform's own data through `call_platform_api`. */
    platformAccess: z.boolean().default(true),
    /** Enter sends (Shift+Enter = newline). Off: Cmd/Ctrl+Enter sends, Enter = newline. */
    sendOnEnter: z.boolean().default(true),
    /** Show "Searched your knowledge base"-style chips under replies. */
    showToolActivity: z.boolean().default(true),
    dictationLanguage: z.enum(DICTATION_LANGUAGES).default('auto'),
    /** Local / self-host only (ADR 0054): lets Mitra give valuation verdicts. Ignored on the hosted site. */
    unrestricted: z.boolean().default(false),
  }),
  display: z.object({
    /** Start every session with portfolio values hidden (the ₹ toggle). */
    hideValuesByDefault: z.boolean().default(false),
  }),
  shortcuts: z.object({
    enabled: z.boolean().default(true),
  }),
  agents: z.object({
    /** Automatic stock analysts (Analyst Desk, ADR 0058): one per holding, checked daily with the user's own AI key. The master switch. */
    auto: z.boolean().default(true),
  }),
});

export type Preferences = z.infer<typeof preferencesSchema>;

/** A patch may set any subset of any group; unknown keys are rejected so typos are not silently dropped. */
export const preferencesPatchSchema = z
  .object({
    chat: preferencesSchema.shape.chat.partial().strict(),
    display: preferencesSchema.shape.display.partial().strict(),
    shortcuts: preferencesSchema.shape.shortcuts.partial().strict(),
    agents: preferencesSchema.shape.agents.partial().strict(),
  })
  .partial()
  .strict();

export type PreferencesPatch = z.infer<typeof preferencesPatchSchema>;

export const DEFAULT_PREFERENCES: Preferences = preferencesSchema.parse({ chat: {}, display: {}, shortcuts: {}, agents: {} });

/** Resolves anything stored (or nothing) to a complete, valid Preferences object; bad values fall back to defaults. */
export function resolvePreferences(stored: unknown): Preferences {
  const parsed = preferencesSchema.safeParse(stored ?? {});
  if (parsed.success) return parsed.data;
  // One bad field must not discard the rest: re-resolve group by group.
  const obj = (stored && typeof stored === 'object' ? stored : {}) as Record<string, unknown>;
  const group = <K extends keyof Preferences>(key: K): Preferences[K] => {
    const r = preferencesSchema.shape[key].safeParse(obj[key] ?? {});
    return (r.success ? r.data : DEFAULT_PREFERENCES[key]) as Preferences[K];
  };
  return { chat: group('chat'), display: group('display'), shortcuts: group('shortcuts'), agents: group('agents') };
}

/** Applies a validated patch to current preferences without mutating either. */
export function applyPatch(current: Preferences, patch: PreferencesPatch): Preferences {
  return {
    chat: { ...current.chat, ...patch.chat },
    display: { ...current.display, ...patch.display },
    shortcuts: { ...current.shortcuts, ...patch.shortcuts },
    agents: { ...current.agents, ...patch.agents },
  };
}

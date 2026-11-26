import { z } from 'zod';
import { RISK_PROFILE_IDS } from '@/lib/onboarding/profiles';

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
    /** Let Mitra remember what the user tells it and use it in later chats (#402, ADR 0083). The user can review and delete every memory. */
    memory: z.boolean().default(true),
    /** Let Mitra search the web and read pages (#401). Queries leave the app, so it can be switched off. */
    webSearch: z.boolean().default(true),
    /** Let Mitra answer with visual cards (A2UI, ADR 0077) built from the user's own data. Off by default. */
    richReplies: z.boolean().default(false),
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
  /** First-run wizard (ADR 0075). `dismissed` = skipped, `completed` = finished; either stops the redirect. */
  onboarding: z.object({
    /** null until the user picks one: new holdings then keep the original guardrail defaults. */
    riskProfile: z.enum(RISK_PROFILE_IDS).nullable().catch(null).default(null),
    completed: z.boolean().default(false),
    dismissed: z.boolean().default(false),
  }),
});

export type Preferences = z.infer<typeof preferencesSchema>;

type Group = keyof Preferences;

/** A field as a patch sees it: no default and no catch (Zod 4 applies both to a missing key, which reset every field the patch did not name, #335). */
function patchField(field: z.ZodType): z.ZodType {
  let inner = field;
  if (inner instanceof z.ZodDefault) inner = inner.unwrap() as z.ZodType;
  if (inner instanceof z.ZodCatch) inner = inner.unwrap() as z.ZodType;
  return inner.optional();
}

function patchGroup<K extends Group>(key: K) {
  const shape = preferencesSchema.shape[key].shape as Record<string, z.ZodType>;
  const fields = Object.fromEntries(Object.entries(shape).map(([name, field]) => [name, patchField(field)]));
  return z.object(fields).strict() as unknown as z.ZodType<Partial<Preferences[K]>>;
}

/** A patch may set any subset of any group; unknown keys are rejected so typos are not silently dropped. */
export const preferencesPatchSchema = z
  .object({
    chat: patchGroup('chat'),
    display: patchGroup('display'),
    shortcuts: patchGroup('shortcuts'),
    agents: patchGroup('agents'),
    onboarding: patchGroup('onboarding'),
  })
  .partial()
  .strict();

export type PreferencesPatch = { [K in Group]?: Partial<Preferences[K]> };

export const DEFAULT_PREFERENCES: Preferences = preferencesSchema.parse({ chat: {}, display: {}, shortcuts: {}, agents: {}, onboarding: {} });

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
  return { chat: group('chat'), display: group('display'), shortcuts: group('shortcuts'), agents: group('agents'), onboarding: group('onboarding') };
}

/** Applies a validated patch to current preferences without mutating either. */
export function applyPatch(current: Preferences, patch: PreferencesPatch): Preferences {
  return {
    chat: { ...current.chat, ...patch.chat },
    display: { ...current.display, ...patch.display },
    shortcuts: { ...current.shortcuts, ...patch.shortcuts },
    agents: { ...current.agents, ...patch.agents },
    onboarding: { ...current.onboarding, ...patch.onboarding },
  };
}

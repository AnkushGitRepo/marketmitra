import { getAiSettings, type AiSettings } from '@/lib/userSettings';
import { isAiProvider } from './providerCatalog';
import { isHosted } from '@/lib/deployment-mode';
import type { AiConfig } from './providers';

/**
 * Load the user's stored key, tolerating a cold-start database blip.
 *
 * `getAiSettings` returns `null` cleanly when the user genuinely has no key
 * stored — that's a normal "add your key" state. A *thrown* error is a
 * different thing: on the first (cold) serverless render a Mongo
 * server-selection / connection-setup step can trip the 5s timeout and
 * throw. The old blanket `.catch(() => null)` made that indistinguishable
 * from "no key", so every insight surface SSR'd "Add your AI provider key"
 * despite a working key (ADR 0018 follow-up, 2026-09-06).
 *
 * Retry a couple of times with a short backoff — the driver has probed the
 * topology by the second/third attempt, so a cold miss almost always clears
 * fast. Only if it *still* throws do we let the error bubble (the insight
 * SSR pages then hit their error boundary — a "reload to try again" state),
 * rather than silently misreport the user's config.
 */
async function loadStoredSettings(userId: string): Promise<AiSettings | null> {
  const delaysMs = [0, 150, 400];
  let lastErr: unknown;
  for (const delay of delaysMs) {
    if (delay) await new Promise((r) => setTimeout(r, delay));
    try {
      return await getAiSettings(userId);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

/**
 * Resolve the AI config to use for a request (ADR 0018 §2):
 *   1. the user's stored, encrypted BYO key
 *   2. deployment env — `AI_PROVIDER` + `AI_API_KEY` (+ optional `AI_MODEL`)
 *      — the self-host path, and the operator's key for shared IPO briefs
 *   3. null → the UI prompts "Add your AI key"
 *
 * `allowEnv: false` skips step 2 — used for per-user insights (stock,
 * portfolio, chat), which must always be the user's own key.
 */
export async function getAiConfig(
  userId: string | null,
  opts: { allowEnv?: boolean } = {}
): Promise<AiConfig | null> {
  if (userId) {
    const stored = await loadStoredSettings(userId);
    if (stored) {
      return { provider: stored.provider, apiKey: stored.apiKey, model: stored.model };
    }
  }

  if (opts.allowEnv !== false) {
    const provider = process.env.AI_PROVIDER;
    const apiKey = process.env.AI_API_KEY;
    if (isAiProvider(provider) && apiKey) {
      return { provider, apiKey, model: process.env.AI_MODEL || null };
    }
  }

  return null;
}

/**
 * Config for a *per-user* AI surface (stock read, portfolio insight, Mitra
 * chat). Uses the caller's own stored key, and the deployment
 * `AI_PROVIDER`/`AI_API_KEY` env key **only in self-host** — where there is
 * a single local user, so "the deployment key" and "the user's key" are the
 * same thing. In hosted mode a per-user surface never falls back to the
 * operator's key (ADR 0018 §2/§5) — only shared IPO briefs may.
 */
export function getUserAiConfig(userId: string | null): Promise<AiConfig | null> {
  return getAiConfig(userId, { allowEnv: !isHosted() });
}

/**
 * "Does this user have a usable AI key?" as a boolean, for SSR surfaces
 * (stock / portfolio / IPO pages) that must still render if the check
 * itself fails.
 *
 *   - real config  → true
 *   - no key       → false  (the honest "Add your AI key" state)
 *   - check threw  → true  (optimistic)
 *
 * The optimistic branch is the ADR 0018 follow-up fix: a cold-start Mongo
 * error must never render as "Add your AI key". `getAiConfig` already
 * retries with backoff; if it still throws we assume the key is there and
 * show the "Generate" affordance. The real generate call runs client-side
 * against a by-then-warm function, so a genuine "no key" still surfaces
 * there — just not as a misleading SSR state.
 */
export async function resolveHasAiKey(configPromise: Promise<AiConfig | null>): Promise<boolean> {
  try {
    return (await configPromise) !== null;
  } catch {
    return true;
  }
}

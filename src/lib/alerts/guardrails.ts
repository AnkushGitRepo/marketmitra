// Default guardrail alerts, created automatically on every new holding
// (ADR 0030 — the direct fix for a holding sitting completely unwatched,
// which is what let a real portfolio's ~40%-over-4-sessions slide in one
// stock go unnoticed). Not silent: every creation is logged to the Mitra
// activity trail (src/lib/mitra/activityLog.ts) and announced through the
// user's configured notification channels, with the reason stated plainly.

import { createAlert } from './store';
import { getAutoGuardrailsEnabled } from '@/lib/userSettings';
import { getPreferences } from '@/lib/preferences/store';
import { guardrailDefaultsFor } from '@/lib/onboarding/profiles';
import { logMitraAction } from '@/lib/mitra/activityLog';
import { deliverNotification, resolveChannels } from '@/lib/notifications/deliver';
import type { NotificationPayload } from '@/lib/notifications/types';
import type { Alert } from './types';

export const DEFAULT_TRAIL_PCT = 10;
export const DEFAULT_DRAWDOWN_WINDOW_SESSIONS = 4;
export const DEFAULT_DRAWDOWN_PCT = 15;

const GUARDRAIL_NOTE =
  'Auto-created by Mitra as a default guardrail — edit or remove anytime.';

/**
 * Creates the default trailing-stop + cumulative-drawdown pair for a
 * newly added holding, unless the user has turned auto-guardrails off in
 * settings. Call this after a holding write succeeds — it never throws
 * (a guardrail-creation hiccup must not fail the holding add itself) and
 * returns whatever it managed to create, which may be an empty array.
 */
export async function createGuardrailAlertsForHolding(
  userId: string,
  symbol: string
): Promise<Alert[]> {
  try {
    const enabled = await getAutoGuardrailsEnabled(userId);
    if (!enabled) return [];

    const sym = symbol.trim().toUpperCase();
    if (!sym) return [];

    // The first-run risk profile (ADR 0075) sets the percentages; with none chosen the original defaults stand.
    const profile = (await getPreferences(userId)).onboarding.riskProfile;
    const { trailPct, drawdownPct } = profile
      ? guardrailDefaultsFor(profile)
      : { trailPct: DEFAULT_TRAIL_PCT, drawdownPct: DEFAULT_DRAWDOWN_PCT };

    const trailingStop = await createAlert(userId, {
      type: 'trailing_stop',
      symbol: sym,
      params: { trailPct },
      note: GUARDRAIL_NOTE,
      rearm: true,
      cooldownMinutes: 240,
      source: 'auto_guardrail',
    });

    const drawdownWatch = await createAlert(userId, {
      type: 'cumulative_drawdown',
      symbol: sym,
      params: { windowSessions: DEFAULT_DRAWDOWN_WINDOW_SESSIONS, pct: drawdownPct },
      note: GUARDRAIL_NOTE,
      rearm: true,
      cooldownMinutes: 240,
      source: 'auto_guardrail',
    });

    const created = [trailingStop, drawdownWatch];

    await Promise.all(
      created.map((alert) =>
        logMitraAction({
          userId,
          action: 'alert_created',
          alertId: alert.id,
          symbol: sym,
          before: null,
          after: { type: alert.type, params: alert.params },
          reason:
            alert.type === 'trailing_stop'
              ? `Added ${sym} to your portfolio with no existing alert on it, so I set a default ${trailPct}% trailing stop — it locks in as the price rises instead of sitting at one fixed floor.`
              : `Added ${sym} with no existing alert on it, so I set a ${drawdownPct}% drawdown watch over ${DEFAULT_DRAWDOWN_WINDOW_SESSIONS} sessions — this catches a slow multi-day slide even when no single day looks alarming on its own.`,
          source: 'auto_guardrail',
        })
      )
    );

    const payload: NotificationPayload = {
      kind: 'system',
      title: `Guardrail alerts set up for ${sym}`,
      body: `No alert existed for ${sym}, so I added a ${trailPct}% trailing stop and a ${drawdownPct}% / ${DEFAULT_DRAWDOWN_WINDOW_SESSIONS}-session drawdown watch. See, edit, or remove these anytime on the Alerts page — or turn auto-guardrails off in Settings.`,
      href: '/alerts',
      meta: { symbol: sym, source: 'auto_guardrail' },
    };
    const channels = await resolveChannels(userId);
    await deliverNotification(userId, payload, channels);

    return created;
  } catch {
    // A guardrail-creation failure must never block adding the holding
    // itself — the caller already committed that write.
    return [];
  }
}

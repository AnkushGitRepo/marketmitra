// Tighter bounds Mitra's own alert-management chat tools enforce on top of
// the public API's zod schemas (schemas.ts) — see ADR 0030 §3. A human
// using the Alerts page directly is free to, say, set a 1% trailing stop;
// an autonomous edit from Mitra is not, because a parameter that extreme
// is functionally useless (fires on noise, or effectively never fires)
// and nobody is there to notice and correct it in the moment the way a
// human setting up their own alert would be. Only checked from
// src/lib/ai/chatTools.ts — never applied to POST/PATCH /api/alerts.

import type { AlertType } from './types';

const TRAIL_PCT_MIN = 3;
const TRAIL_PCT_MAX = 25;
const DRAWDOWN_WINDOW_MIN = 2;
const DRAWDOWN_WINDOW_MAX = 10;
const DRAWDOWN_PCT_MIN = 5;
const DRAWDOWN_PCT_MAX = 50;
const PERCENT_MOVE_MIN = 1;
const PERCENT_MOVE_MAX = 50;
const WEEK52_WITHIN_MAX = 20;

/**
 * Returns null when `params` are within Mitra's allowed range for `type`,
 * or a user-facing explanation of the violated bound otherwise (written
 * so the tool can hand it straight back as the `execute()` error — Mitra
 * should relay it to the user, not retry with different numbers).
 */
export function checkMitraBounds(type: AlertType, params: Record<string, unknown>): string | null {
  switch (type) {
    case 'trailing_stop': {
      const trailPct = Number(params.trailPct);
      if (!(trailPct >= TRAIL_PCT_MIN && trailPct <= TRAIL_PCT_MAX)) {
        return `A trailing stop set by Mitra must be between ${TRAIL_PCT_MIN}% and ${TRAIL_PCT_MAX}% (got ${params.trailPct}). The user can set a value outside that range themselves from the Alerts page.`;
      }
      return null;
    }
    case 'cumulative_drawdown': {
      const windowSessions = Number(params.windowSessions);
      const pct = Number(params.pct);
      if (!(windowSessions >= DRAWDOWN_WINDOW_MIN && windowSessions <= DRAWDOWN_WINDOW_MAX)) {
        return `A drawdown window set by Mitra must be between ${DRAWDOWN_WINDOW_MIN} and ${DRAWDOWN_WINDOW_MAX} sessions (got ${params.windowSessions}).`;
      }
      if (!(pct >= DRAWDOWN_PCT_MIN && pct <= DRAWDOWN_PCT_MAX)) {
        return `A drawdown threshold set by Mitra must be between ${DRAWDOWN_PCT_MIN}% and ${DRAWDOWN_PCT_MAX}% (got ${params.pct}).`;
      }
      return null;
    }
    case 'percent_move': {
      const pct = Number(params.pct);
      if (!(pct >= PERCENT_MOVE_MIN && pct <= PERCENT_MOVE_MAX)) {
        return `A percent-move threshold set by Mitra must be between ${PERCENT_MOVE_MIN}% and ${PERCENT_MOVE_MAX}% (got ${params.pct}).`;
      }
      return null;
    }
    case 'week52_breach': {
      const withinPct = params.withinPct === undefined ? 0 : Number(params.withinPct);
      if (!(withinPct >= 0 && withinPct <= WEEK52_WITHIN_MAX)) {
        return `A 52-week margin set by Mitra must be between 0% and ${WEEK52_WITHIN_MAX}% (got ${params.withinPct}).`;
      }
      return null;
    }
    case 'price_threshold':
    case 'portfolio_pnl':
      // Price levels and P&L thresholds are inherently symbol/portfolio-
      // specific — there's no sane universal numeric range to bound them
      // by, so these rely on the schema's own positivity checks only.
      return null;
    default:
      return `Mitra cannot manage alerts of type "${type}".`;
  }
}

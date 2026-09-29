// Tools handed to the Mitra chat model (Phase 10 / ADR 0020; navigation
// tools added in ADR 0022; alert-management tools added in ADR 0030).
//
// Four groups:
//   - the read-only market-data tools from the MCP layer (`src/lib/mcp/
//     tools.ts`), adapted to the AI SDK's `tool()` shape — live quotes,
//     fundamentals, price history, news, IPOs, indices;
//   - `search_context`, which vector-searches the retrieval corpus
//     (indexed news + filings + the caller's private notes/holdings);
//   - 4 navigation tools that let the client move the user to a page;
//   - 4 alert-management tools (ADR 0030) — the one place Mitra can write
//     anything. Scoped narrowly and deliberately: alerts only (never
//     holdings, settings, security, or billing), never a full delete
//     (`set_alert_status` can only pause/resume), every write requires a
//     real `reason` string enforced at the schema level, every write is
//     logged to `mitraActions` (`src/lib/mitra/activityLog.ts`) for
//     `/dashboard/mitra-activity`, and every numeric parameter is checked
//     against `src/lib/alerts/mitraBounds.ts` — a second, tighter range
//     than what a human is allowed to set through the Alerts page UI.
//
// Structured/current data is tool-called, not embedded (ADR 0020). The
// chat route wraps `streamChat` in a tool-calling loop with these.
//
// HARD BOUNDARY (ADR 0022, amended by ADR 0030): this is the *entire*
// ToolSet Mitra ever receives. There is still no tool here for account
// settings, security settings, billing, holdings, or a hard delete of
// anything — the alert-management tools added by ADR 0030 are the single,
// explicit, narrowly-scoped exception, not a general write capability. The
// boundary is enforced by these tools simply not existing, not by a prompt
// instruction. If you're adding a tool, it belongs in this file; adding
// write access to a new category needs its own ADR, not a quiet addition
// here (see ADR 0030 for what that looked like in practice).

import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { tools as mcpTools } from '@/lib/mcp/tools';
import { retrieve } from '@/lib/rag/retrieve';
import { paramsSchemaForType } from '@/lib/alerts/schemas';
import { createAlert, getAlertById, listAlerts, updateAlert } from '@/lib/alerts/store';
import { checkMitraBounds } from '@/lib/alerts/mitraBounds';
import { logMitraAction } from '@/lib/mitra/activityLog';
import type { AlertParams } from '@/lib/alerts/types';

const SEARCH_CONTEXT_LIMIT = 6;

export function buildChatTools(userId: string | null): ToolSet {
  const set: ToolSet = {};

  for (const t of mcpTools) {
    set[t.name] = tool({
      description: t.config.description,
      inputSchema: t.config.inputSchema,
      execute: async (args: unknown) => {
        try {
          return await t.run(args as never);
        } catch (err) {
          return { error: err instanceof Error ? err.message : 'tool failed' };
        }
      },
    });
  }

  set.search_context = tool({
    description:
      "Search MarketMitra's indexed corpus — recent news articles, company annual-report filings, and the user's own saved notes — for passages relevant to a question. Use for background, \"why did X move\", or filing detail. Returns short passages with their source; `available: false` means the corpus isn't reachable, fall back to the other tools.",
    inputSchema: z.object({
      query: z.string().trim().min(1).max(400).describe('A natural-language search query.'),
      symbol: z
        .string()
        .trim()
        .max(30)
        .optional()
        .describe('Restrict to this NSE symbol plus non-stock passages.'),
    }),
    execute: async ({ query, symbol }) => {
      const hits = await retrieve({
        query,
        userId,
        symbol: symbol ? symbol.toUpperCase() : undefined,
        limit: SEARCH_CONTEXT_LIMIT,
      });
      if (hits === null) return { available: false, passages: [] };
      return {
        available: true,
        passages: hits.map((h) => ({
          text: h.text,
          source: h.title ?? h.source,
          url: h.sourceUrl,
          kind: h.docType,
          published: h.publishedAt ? h.publishedAt.toISOString().slice(0, 10) : null,
          score: Number(h.score.toFixed(3)),
        })),
      };
    },
  });

  // Navigation (ADR 0022). Each `execute` only confirms the destination —
  // it cannot move the browser itself. The client (AiWidget) watches for
  // these specific tool parts and calls `router.push` to the route named
  // here, so the two must stay in sync.
  set.navigate_to_dashboard = tool({
    description: 'Open the dashboard home page.',
    inputSchema: z.object({}),
    execute: async () => ({ navigated: true, to: '/dashboard' }),
  });

  set.navigate_to_portfolio = tool({
    description: 'Open the portfolio / holdings page.',
    inputSchema: z.object({}),
    execute: async () => ({ navigated: true, to: '/dashboard/portfolio' }),
  });

  set.navigate_to_markets = tool({
    description: 'Open the markets page (indices, movers).',
    inputSchema: z.object({}),
    execute: async () => ({ navigated: true, to: '/dashboard/markets' }),
  });

  set.open_stock = tool({
    description:
      "Open a stock's detail page. Use the NSE symbol the user means (from context if they said 'this stock' or similar).",
    inputSchema: z.object({
      ticker: z.string().trim().min(1).max(20).describe('NSE symbol, e.g. TCS.'),
    }),
    execute: async ({ ticker }) => ({
      navigated: true,
      to: `/dashboard/stock/${encodeURIComponent(ticker.toUpperCase())}`,
    }),
  });

  // Alert management (ADR 0030). See this file's header comment for the
  // scope of what these can and cannot do.

  const mitraAlertTypeEnum = z.enum([
    'price_threshold',
    'percent_move',
    'week52_breach',
    'portfolio_pnl',
    'trailing_stop',
    'cumulative_drawdown',
  ]);
  const mitraParamsSchema = z
    .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
    .describe("Type-specific parameters. price_threshold: {direction:'above'|'below', threshold}. percent_move: {direction:'up'|'down'|'either', pct}. week52_breach: {edge:'high'|'low', withinPct?}. portfolio_pnl: {metric:'total_value'|'unrealized_pnl'|'unrealized_pnl_pct', direction:'above'|'below', threshold}. trailing_stop: {trailPct} — 3 to 25 when set by you. cumulative_drawdown: {windowSessions, pct} — 2 to 10 sessions, 5 to 50% when set by you.");
  const reasonSchema = z
    .string()
    .trim()
    .min(10)
    .max(300)
    .describe(
      'Why you are doing this, in plain language a person would understand — this is logged and shown to the user on their Mitra-activity page verbatim, so write it for them, not for a log file.'
    );

  set.list_alerts = tool({
    description:
      "List the signed-in user's own alerts — type, symbol, params, status, and who created each one (you, an automatic default guardrail, or the user themselves). Call this before creating or changing anything so you don't duplicate an existing alert or lose track of what's already watching a symbol.",
    inputSchema: z.object({}),
    execute: async () => {
      if (!userId) return { error: 'Not signed in.' };
      const alerts = await listAlerts(userId);
      return {
        alerts: alerts.map((a) => ({
          id: a.id,
          type: a.type,
          symbol: a.symbol,
          params: a.params,
          status: a.status,
          note: a.note,
          source: a.source,
          rearm: a.rearm,
          peakPrice: a.peakPrice,
          lastObservedValue: a.lastObservedValue,
          triggeredAt: a.triggeredAt ? a.triggeredAt.toISOString() : null,
        })),
      };
    },
  });

  set.create_alert = tool({
    description:
      "Create a new alert on a stock or the whole portfolio — on your own judgment (e.g. you notice a holding with no protection) or because the user asked. Cannot create ipo/ipo_watch alerts (use the IPO page for those). Bounds on trailing_stop/cumulative_drawdown/percent_move/week52_breach are stricter than what the Alerts page UI allows a human to set — if your params are rejected, tell the user the actual bound rather than silently retrying with different numbers, or suggest they set it themselves on the Alerts page for a value outside that range.",
    inputSchema: z.object({
      type: mitraAlertTypeEnum,
      symbol: z
        .string()
        .trim()
        .min(1)
        .max(20)
        .optional()
        .describe('NSE symbol. Omit only for a whole-portfolio portfolio_pnl alert.'),
      params: mitraParamsSchema,
      note: z.string().trim().max(200).optional(),
      rearm: z
        .boolean()
        .optional()
        .describe('Keep watching after it fires instead of going one-shot. Defaults to true.'),
      cooldownMinutes: z.number().int().min(5).max(1440).optional(),
      reason: reasonSchema,
    }),
    execute: async ({ type, symbol, params, note, rearm, cooldownMinutes, reason }) => {
      if (!userId) return { error: 'Not signed in.' };

      const parsedParams = paramsSchemaForType(type).safeParse(params);
      if (!parsedParams.success) {
        return { error: `Invalid params for ${type}: ${parsedParams.error.message}` };
      }
      const boundsError = checkMitraBounds(type, parsedParams.data as Record<string, unknown>);
      if (boundsError) return { error: boundsError };

      const needsSymbol = type !== 'portfolio_pnl';
      if (needsSymbol && !symbol) return { error: `A ${type} alert needs a symbol.` };

      const alert = await createAlert(userId, {
        type,
        symbol: symbol ? symbol.toUpperCase() : null,
        params: parsedParams.data as Omit<AlertParams, 'type'>,
        note: note ?? null,
        rearm: rearm ?? true,
        cooldownMinutes,
        source: 'mitra',
      });

      await logMitraAction({
        userId,
        action: 'alert_created',
        alertId: alert.id,
        symbol: alert.symbol,
        before: null,
        after: { type: alert.type, params: alert.params },
        reason,
        source: 'mitra',
      });

      return { created: true, alertId: alert.id, type: alert.type, symbol: alert.symbol, params: alert.params };
    },
  });

  set.update_alert_params = tool({
    description:
      "Change an existing alert's parameters, note, re-arm behavior, or cooldown. Cannot change an alert's type or symbol (create a new one instead) and cannot delete anything — use set_alert_status to pause one instead. The same bounds as create_alert apply.",
    inputSchema: z.object({
      alertId: z.string().trim().min(1).describe('From list_alerts.'),
      params: mitraParamsSchema.optional(),
      note: z.string().trim().max(200).nullable().optional(),
      rearm: z.boolean().optional(),
      cooldownMinutes: z.number().int().min(5).max(1440).optional(),
      reason: reasonSchema,
    }),
    execute: async ({ alertId, params, note, rearm, cooldownMinutes, reason }) => {
      if (!userId) return { error: 'Not signed in.' };
      const existing = await getAlertById(userId, alertId);
      if (!existing) return { error: 'No alert with that id (or it is not yours).' };

      let validatedParams: Omit<AlertParams, 'type'> | undefined;
      if (params !== undefined) {
        const parsed = paramsSchemaForType(existing.type).safeParse(params);
        if (!parsed.success) {
          return { error: `Invalid params for ${existing.type}: ${parsed.error.message}` };
        }
        const boundsError = checkMitraBounds(existing.type, parsed.data as Record<string, unknown>);
        if (boundsError) return { error: boundsError };
        validatedParams = parsed.data as Omit<AlertParams, 'type'>;
      }

      const updated = await updateAlert(userId, alertId, {
        params: validatedParams,
        note,
        rearm,
        cooldownMinutes,
      });
      if (!updated) return { error: 'Could not update that alert.' };

      await logMitraAction({
        userId,
        action: 'alert_updated',
        alertId: updated.id,
        symbol: updated.symbol,
        before: {
          params: existing.params,
          note: existing.note,
          rearm: existing.rearm,
          cooldownMinutes: existing.cooldownMinutes,
        },
        after: {
          params: updated.params,
          note: updated.note,
          rearm: updated.rearm,
          cooldownMinutes: updated.cooldownMinutes,
        },
        reason,
        source: 'mitra',
      });

      return { updated: true, alertId: updated.id, params: updated.params };
    },
  });

  set.set_alert_status = tool({
    description:
      "Pause or resume an alert. This is the only status change available to you — there is no delete tool, deliberately (a pause is always reversible; the user can still delete it themselves from the Alerts page if that's really what's needed).",
    inputSchema: z.object({
      alertId: z.string().trim().min(1).describe('From list_alerts.'),
      status: z.enum(['active', 'paused']),
      reason: reasonSchema,
    }),
    execute: async ({ alertId, status, reason }) => {
      if (!userId) return { error: 'Not signed in.' };
      const existing = await getAlertById(userId, alertId);
      if (!existing) return { error: 'No alert with that id (or it is not yours).' };
      if (existing.status === status) return { updated: false, alertId, status, note: 'already in that state' };

      const updated = await updateAlert(userId, alertId, { status });
      if (!updated) return { error: 'Could not update that alert.' };

      await logMitraAction({
        userId,
        action: status === 'paused' ? 'alert_paused' : 'alert_resumed',
        alertId: updated.id,
        symbol: updated.symbol,
        before: { status: existing.status },
        after: { status: updated.status },
        reason,
        source: 'mitra',
      });

      return { updated: true, alertId: updated.id, status: updated.status };
    },
  });

  return set;
}

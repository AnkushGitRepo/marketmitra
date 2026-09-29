import { z } from 'zod';
import type { AlertType } from './types';

// Wire-shape validation for the /api/alerts routes (ADR 0014 §5, §6).

const symbolSchema = z.string().trim().min(1).max(20).toUpperCase();

export const priceThresholdParamsSchema = z.object({
  direction: z.enum(['above', 'below']),
  threshold: z.number().positive(),
});

export const percentMoveParamsSchema = z.object({
  direction: z.enum(['up', 'down', 'either']),
  pct: z.number().positive().max(100),
});

export const week52BreachParamsSchema = z.object({
  edge: z.enum(['high', 'low']),
  withinPct: z.number().min(0).max(50).optional(),
});

export const portfolioPnlParamsSchema = z.object({
  metric: z.enum(['total_value', 'unrealized_pnl', 'unrealized_pnl_pct']),
  direction: z.enum(['above', 'below']),
  threshold: z.number(),
});

export const trailingStopParamsSchema = z.object({
  trailPct: z.number().positive().max(50),
});

export const cumulativeDrawdownParamsSchema = z.object({
  windowSessions: z.number().int().min(2).max(20),
  pct: z.number().positive().max(100),
});

export const ipoWatchParamsSchema = z.object({
  triggers: z.object({
    opens: z.boolean(),
    lastDay: z.boolean(),
    allotmentListing: z.boolean(),
  }),
  gmpThresholdPct: z.number().positive().max(500).optional(),
  ipoType: z.enum(['all', 'mainboard']),
});

export const ipoAlertParamsSchema = z.object({
  ipoSlug: z.string().trim().min(1).max(160),
  trigger: z.enum(['opens', 'last_day', 'allotment_listing', 'gmp_threshold']),
  gmpThresholdPct: z.number().positive().max(500).optional(),
  gmpThresholdAbs: z.number().optional(),
});

/** The params validator for a given alert type — used by POST (via the
 * discriminated union below) and by PATCH (which knows the type only after
 * loading the existing alert). */
export function paramsSchemaForType(type: AlertType) {
  switch (type) {
    case 'price_threshold':
      return priceThresholdParamsSchema;
    case 'percent_move':
      return percentMoveParamsSchema;
    case 'week52_breach':
      return week52BreachParamsSchema;
    case 'portfolio_pnl':
      return portfolioPnlParamsSchema;
    case 'trailing_stop':
      return trailingStopParamsSchema;
    case 'cumulative_drawdown':
      return cumulativeDrawdownParamsSchema;
    case 'ipo_watch':
      return ipoWatchParamsSchema;
    case 'ipo':
      return ipoAlertParamsSchema;
  }
}

const commonCreateFields = z.object({
  note: z.string().trim().max(200).optional(),
  rearm: z.boolean().optional(),
  cooldownMinutes: z.number().int().min(5).max(1440).optional(),
});

// Deliberately NOT exposing `source` here: it must never come from a
// client-supplied request body (a user's own fetch could otherwise claim
// `source: 'mitra'` and slip past the Mitra-activity audit trail). The
// public POST /api/alerts route always creates with the store's default
// ('user'); the holding-add guardrail hook and Mitra's own tools call
// createAlert() directly, server-side, with an explicit source.

export const createAlertSchema = z
  .discriminatedUnion('type', [
    z.object({
      type: z.literal('price_threshold'),
      symbol: symbolSchema,
      params: priceThresholdParamsSchema,
    }),
    z.object({
      type: z.literal('percent_move'),
      symbol: symbolSchema,
      params: percentMoveParamsSchema,
    }),
    z.object({
      type: z.literal('week52_breach'),
      symbol: symbolSchema,
      params: week52BreachParamsSchema,
    }),
    z.object({
      type: z.literal('portfolio_pnl'),
      // Optional: present = scoped to that one holding's P&L; absent = whole book.
      symbol: symbolSchema.nullish(),
      params: portfolioPnlParamsSchema,
    }),
    z.object({
      type: z.literal('trailing_stop'),
      symbol: symbolSchema,
      params: trailingStopParamsSchema,
    }),
    z.object({
      type: z.literal('cumulative_drawdown'),
      symbol: symbolSchema,
      params: cumulativeDrawdownParamsSchema,
    }),
    z.object({
      type: z.literal('ipo_watch'),
      symbol: z.null().optional(),
      params: ipoWatchParamsSchema,
    }),
    z.object({
      type: z.literal('ipo'),
      symbol: z.null().optional(),
      params: ipoAlertParamsSchema,
    }),
  ])
  .and(commonCreateFields);

export const updateAlertSchema = z.object({
  note: z.string().trim().max(200).nullable().optional(),
  status: z.enum(['active', 'paused']).optional(),
  rearm: z.boolean().optional(),
  cooldownMinutes: z.number().int().min(5).max(1440).optional(),
  // Validated against the existing alert's type in the route handler.
  params: z.unknown().optional(),
});

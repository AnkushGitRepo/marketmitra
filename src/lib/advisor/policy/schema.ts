import { z } from 'zod';

// The Investment Policy: the rulebook the user writes once and the agent can
// never override. Validation lives here so the API, the settings page and the
// JSON import all enforce exactly the same rules.

const pct = z.number().min(0).max(100);
const inr = z.number().min(0).max(1e10);

export const indexCoreHoldingSchema = z.object({
  name: z.string().trim().min(1).max(80),
  weightPct: z.number().gt(0).max(100),
});

const symbolList = z.array(z.string().trim().min(1).max(40)).max(200);

export const REBALANCE_CADENCES = ['annual', 'semiannual', 'quarterly'] as const;

const SUM_TOLERANCE = 0.01;
const sumsTo100 = (values: number[]) =>
  Math.abs(values.reduce((a, b) => a + b, 0) - 100) <= SUM_TOLERANCE;

export const policyBaseSchema = z.object({
  monthlyContributionINR: inr,
  lumpSumINR: inr.optional(),
  horizonYears: z.number().int().min(1).max(60),
  maxTolerableDrawdownPct: z.number().min(1).max(95),
  targetAllocation: z.object({
    indexCorePct: pct,
    satellitePct: pct,
    cashPct: pct,
  }),
  indexCoreHoldings: z.array(indexCoreHoldingSchema).max(10),
  maxPositionPct: z.number().gt(0).max(100).default(8),
  maxSatelliteStocks: z.number().int().min(0).max(50).default(8),
  minHoldMonths: z.number().int().min(0).max(120).default(12),
  trancheMonths: z.number().int().min(1).max(36).default(6),
  rebalanceBandPct: z.number().min(0.5).max(50).default(5),
  rebalanceCadence: z.enum(REBALANCE_CADENCES).default('annual'),
  taxAware: z.boolean().default(true),
  /** After a "buy the dip" question is answered once, further ones within this many days are only pointed back at the policy. 0 disables. */
  dipCooldownDays: z.number().int().min(0).max(365).default(14),
  excludedSectors: z.array(z.string().trim().min(1).max(80)).max(50).default([]),
  excludedTickers: symbolList.default([]),
});

export const policySchema = policyBaseSchema.superRefine((p, ctx) => {
  const { indexCorePct, satellitePct, cashPct } = p.targetAllocation;
  if (!sumsTo100([indexCorePct, satellitePct, cashPct])) {
    ctx.addIssue({
      code: 'custom',
      path: ['targetAllocation'],
      message: 'indexCorePct + satellitePct + cashPct must add up to 100.',
    });
  }
  if (indexCorePct > 0) {
    if (p.indexCoreHoldings.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['indexCoreHoldings'],
        message: 'Add at least one index fund/ETF when indexCorePct is above 0.',
      });
    } else if (!sumsTo100(p.indexCoreHoldings.map((h) => h.weightPct))) {
      ctx.addIssue({
        code: 'custom',
        path: ['indexCoreHoldings'],
        message: 'Index core weights must add up to 100.',
      });
    }
  }
  const names = p.indexCoreHoldings.map((h) => h.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['indexCoreHoldings'],
      message: 'Index core holdings must have distinct names.',
    });
  }
  if (p.targetAllocation.satellitePct > 0) {
    if (p.maxSatelliteStocks === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxSatelliteStocks'],
        message: 'satellitePct is above 0 but maxSatelliteStocks is 0.',
      });
    } else if (p.maxPositionPct * p.maxSatelliteStocks + SUM_TOLERANCE < p.targetAllocation.satellitePct) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxPositionPct'],
        message:
          'maxPositionPct × maxSatelliteStocks is smaller than satellitePct, so the satellite sleeve could never be filled within your own limits.',
      });
    }
  }
});

export type InvestmentPolicy = z.infer<typeof policySchema>;
export type IndexCoreHolding = z.infer<typeof indexCoreHoldingSchema>;
export type RebalanceCadence = (typeof REBALANCE_CADENCES)[number];

/** A sensible starting point for the settings form — not saved until the user does. */
export const DEFAULT_POLICY: InvestmentPolicy = {
  monthlyContributionINR: 0,
  horizonYears: 10,
  maxTolerableDrawdownPct: 30,
  targetAllocation: { indexCorePct: 70, satellitePct: 20, cashPct: 10 },
  indexCoreHoldings: [{ name: 'Nifty 50 index fund', weightPct: 100 }],
  maxPositionPct: 8,
  maxSatelliteStocks: 8,
  minHoldMonths: 12,
  trancheMonths: 6,
  rebalanceBandPct: 5,
  rebalanceCadence: 'annual',
  taxAware: true,
  dipCooldownDays: 14,
  excludedSectors: [],
  excludedTickers: [],
};

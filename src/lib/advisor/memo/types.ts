import { z } from 'zod';

// The research memo's structure. Every factual statement is a `Claim`: text plus
// citations to a source passage (verbatim quote) — or an explicit "not found".

export const citationSchema = z.object({
  /** Id of a provided passage (e.g. "AR1-07") or fact (e.g. "F3"). */
  sourceId: z.string().min(1).max(40),
  /** A verbatim excerpt of that source supporting the claim. */
  quote: z.string().min(8).max(500),
});

export const claimSchema = z.object({
  text: z.string().min(3).max(700),
  citations: z.array(citationSchema).max(4).default([]),
  /** True when the provided material does not cover this point. */
  notFound: z.boolean().default(false),
});

/** The only things a kill criterion may watch — each is computable from the same
 * data the screen uses, so Phase 4 can monitor it without any LLM. */
export const KILL_METRICS = [
  'roce_pct',
  'debt_to_equity',
  'promoter_pledge_pct',
  'promoter_holding_pct',
  'free_cash_flow_cr',
  'revenue_growth_pct',
  'net_profit_growth_pct',
] as const;
export type KillMetric = (typeof KILL_METRICS)[number];

export const killCriterionSchema = z.object({
  description: z.string().min(5).max(240),
  metric: z.enum(KILL_METRICS),
  operator: z.enum(['<', '>']),
  threshold: z.number().finite(),
  /** How many consecutive periods the breach must last. */
  consecutivePeriods: z.number().int().min(1).max(8),
  periodUnit: z.enum(['year', 'quarter']),
  rationale: claimSchema,
});

export const memoSchema = z.object({
  business: z.array(claimSchema).min(1).max(4),
  moat: z.object({
    assessment: claimSchema,
    erosionRisks: z.array(claimSchema).min(1).max(4),
  }),
  management: z.array(claimSchema).min(1).max(4),
  capitalAllocation: z.array(claimSchema).min(1).max(4),
  risks: z.array(claimSchema).min(2).max(6),
  thesis: claimSchema,
  killCriteria: z.array(killCriterionSchema).min(2).max(5),
});

export type Citation = z.infer<typeof citationSchema>;
export type Claim = z.infer<typeof claimSchema>;
export type KillCriterion = z.infer<typeof killCriterionSchema>;
export type Memo = z.infer<typeof memoSchema>;

/** A citable source: a filing passage or a structured fact. */
export interface SourceRef {
  id: string;
  /** Human label, e.g. "Annual report FY2026" or "Screen: ROCE". */
  label: string;
  text: string;
  kind: 'passage' | 'fact';
}

/** Allowed ranges so a "measurable" criterion is actually sensible. */
export const KILL_METRIC_RANGE: Record<KillMetric, { min: number; max: number }> = {
  roce_pct: { min: -50, max: 200 },
  debt_to_equity: { min: 0, max: 20 },
  promoter_pledge_pct: { min: 0, max: 100 },
  promoter_holding_pct: { min: 0, max: 100 },
  free_cash_flow_cr: { min: -1e7, max: 1e7 },
  revenue_growth_pct: { min: -100, max: 500 },
  net_profit_growth_pct: { min: -1000, max: 1000 },
};

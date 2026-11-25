import { z } from 'zod';
import { type DataTableBlock, type ResearchBlock } from '../blocks';

export const RISK_CATEGORIES = ['Operational', 'Financial', 'Regulatory and legal', 'Competitive'] as const;
const LEVELS = ['Low', 'Medium', 'High'] as const;
type Level = (typeof LEVELS)[number];

const riskItem = z.object({
  category: z.enum(RISK_CATEGORIES),
  risk: z.string().trim().min(5).max(400),
  probability: z.enum(LEVELS),
  severity: z.enum(LEVELS),
  watch: z.string().trim().min(3).max(300),
});

export const riskRegisterSchema = z.object({ risks: z.array(riskItem).min(1).max(12) });
export type RiskItem = z.infer<typeof riskItem>;

const WEIGHT: Record<Level, number> = { Low: 1, Medium: 2, High: 3 };

/** Probability times severity, 1 to 9. */
export const riskScore = (r: Pick<RiskItem, 'probability' | 'severity'>): number => WEIGHT[r.probability] * WEIGHT[r.severity];

const RATING_HIGH = 6;
const RATING_MEDIUM = 3;
export const riskRating = (score: number): Level => (score >= RATING_HIGH ? 'High' : score >= RATING_MEDIUM ? 'Medium' : 'Low');

/** The register as a table, the highest-rated risks first (the model's order breaks ties). Null when there are no risks. */
export function riskBlocks(risks: readonly RiskItem[]): ResearchBlock[] {
  if (risks.length === 0) return [];
  const ordered = risks.map((r, i) => ({ r, i })).sort((a, b) => riskScore(b.r) - riskScore(a.r) || a.i - b.i);
  const table: DataTableBlock = {
    type: 'data_table',
    title: 'Risk register',
    note: 'Probability and severity are the analysis model’s judgement from the facts in this report; the rating is their product.',
    columns: [
      { key: 'category', label: 'Category', format: 'text' },
      { key: 'risk', label: 'Risk', format: 'text' },
      { key: 'probability', label: 'Probability', format: 'text' },
      { key: 'severity', label: 'Severity', format: 'text' },
      { key: 'rating', label: 'Rating', format: 'text' },
      { key: 'watch', label: 'What to watch', format: 'text' },
    ],
    rows: ordered.map(({ r }) => ({ category: r.category, risk: r.risk, probability: r.probability, severity: r.severity, rating: riskRating(riskScore(r)), watch: r.watch })),
  };
  return [table];
}

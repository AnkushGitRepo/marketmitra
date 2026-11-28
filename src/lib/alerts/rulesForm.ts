import type { PortfolioRulesParams } from './types';

const MAX_LEVELS = 6;

/** "100, 200 300" -> [100, 200, 300]: positive numbers up to `max`, unique, ascending, at most six. Anything else is dropped. */
export function parseLevels(text: string, max: number): number[] {
  const nums = text
    .split(/[\s,]+/)
    .map((t) => Number(t.replace('%', '')))
    .filter((n) => Number.isFinite(n) && n > 0 && n <= max);
  return [...new Set(nums)].sort((a, b) => a - b).slice(0, MAX_LEVELS);
}

export interface RulesDraft {
  readonly milestones: boolean;
  readonly milestoneText: string;
  readonly drawdown: boolean;
  readonly drawdownText: string;
  readonly weight: boolean;
  readonly weightText: string;
  readonly high: boolean;
}

/** The saved rules as form state. With nothing saved every rule starts off, showing the suggested values. */
export function draftFromParams(params: PortfolioRulesParams | null, defaults: PortfolioRulesParams): RulesDraft {
  const p = params ?? defaults;
  return {
    milestones: params !== null && p.profitMilestonesPct.length > 0,
    milestoneText: (p.profitMilestonesPct.length ? p.profitMilestonesPct : defaults.profitMilestonesPct).join(', '),
    drawdown: params !== null && p.costDrawdownPct.length > 0,
    drawdownText: (p.costDrawdownPct.length ? p.costDrawdownPct : defaults.costDrawdownPct).join(', '),
    weight: params !== null && p.maxPositionWeightPct !== null,
    weightText: String(p.maxPositionWeightPct ?? defaults.maxPositionWeightPct ?? 20),
    high: params !== null && p.week52High,
  };
}

/** The form as params, or an error message for a switched-on rule that has no usable number. */
export function paramsFromDraft(d: RulesDraft): { ok: true; params: PortfolioRulesParams } | { ok: false; error: string } {
  const milestones = d.milestones ? parseLevels(d.milestoneText, 10_000) : [];
  const drawdown = d.drawdown ? parseLevels(d.drawdownText, 100) : [];
  const weight = d.weight ? Number(d.weightText) : null;
  if (d.milestones && milestones.length === 0) return { ok: false, error: 'Enter at least one gain level, e.g. 100, 200.' };
  if (d.drawdown && drawdown.length === 0) return { ok: false, error: 'Enter at least one loss level between 1 and 100, e.g. 10, 25.' };
  if (d.weight && !(weight !== null && Number.isFinite(weight) && weight > 0 && weight <= 100)) return { ok: false, error: 'Enter a share between 1 and 100 for the single-stock limit.' };
  return { ok: true, params: { profitMilestonesPct: milestones, costDrawdownPct: drawdown, maxPositionWeightPct: weight, week52High: d.high } };
}

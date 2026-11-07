import type { KillCriterion } from './types';

// Baseline exit triggers added by code to every memo, independent of the LLM.
// These mirror the screen's quality gates with a buffer: a thesis that was
// built on them is broken when they are clearly breached. Edit freely.
export const DEFAULT_KILL_CRITERIA: Array<Omit<KillCriterion, 'rationale'>> = [
  {
    description: 'ROCE below 12% for two consecutive years',
    metric: 'roce_pct',
    operator: '<',
    threshold: 12,
    consecutivePeriods: 2,
    periodUnit: 'year',
  },
  {
    description: 'Debt/equity above 0.8',
    metric: 'debt_to_equity',
    operator: '>',
    threshold: 0.8,
    consecutivePeriods: 1,
    periodUnit: 'year',
  },
  {
    description: 'Promoter pledge above 10%',
    metric: 'promoter_pledge_pct',
    operator: '>',
    threshold: 10,
    consecutivePeriods: 1,
    periodUnit: 'quarter',
  },
];

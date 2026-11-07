import type { MonthlyPlan } from '../allocation/core';
import type { KillMetric } from '../memo/types';
import type { ScreenResult } from '../screen/types';

export type JournalKind = 'stock' | 'plan';
export type JournalAction = 'pending' | 'followed' | 'ignored' | 'modified';

export interface StoredKill {
  description: string;
  metric: KillMetric;
  operator: '<' | '>';
  threshold: number;
  consecutivePeriods: number;
  periodUnit: 'year' | 'quarter';
  /** Where it came from: the memo's own, or the standing rules added by code. */
  source: 'memo' | 'standing';
}

export interface KillFiring {
  key: string;
  description: string;
  at: string;
  observed: Array<number | null>;
}

export interface JournalEntry {
  id: string;
  kind: JournalKind;
  createdAt: string;
  /** NSE symbol for a stock recommendation; "PLAN" for a monthly plan. */
  symbol: string;
  name: string;
  /** Last traded price when recorded (null for plans, or if no quote). */
  priceAtTime: number | null;
  amountINR: number;
  thesis: string;
  killCriteria: StoredKill[];
  memoId: string | null;
  /** Source data at the time, so the decision can be reviewed later. */
  snapshot: { screen: ScreenResult | null; plan: MonthlyPlan | null };
  action: JournalAction;
  actionNote: string | null;
  actionAt: string | null;
  /** The amount actually invested, when it differs from the recommendation. */
  actedAmountINR: number | null;
  killFired: KillFiring[];
}

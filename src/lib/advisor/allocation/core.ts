import type { InvestmentPolicy } from '../policy/schema';

// Deterministic monthly allocation (Phase 1: index core + cash only; the
// satellite sleeve is parked until the quality screen supplies names).
// Pure: no clock, no network, no randomness — `asOf` is passed in, so
// identical input always yields identical output. Every line carries the rule
// that produced it.

export interface PortfolioSnapshot {
  indexCoreValueINR: number;
  satelliteValueINR: number;
  cashINR: number;
}

export interface PlanInput {
  policy: InvestmentPolicy;
  /** ISO date (YYYY-MM-DD) the plan is for. */
  asOf: string;
  /** How many lump-sum tranches have already been deployed (0 if none). */
  lumpSumTranchesDeployed?: number;
  /** ISO date of the last rebalance; null/undefined = never. */
  lastRebalancedOn?: string | null;
  /** Current sleeve values; omit if unknown (rebalancing is then skipped). */
  portfolio?: PortfolioSnapshot | null;
}

export type PlanLineKind = 'buy_index' | 'hold_satellite' | 'hold_cash' | 'rebalance_sell';

export interface PlanLine {
  kind: PlanLineKind;
  target: string;
  amountINR: number;
  rule: string;
}

export interface MonthlyPlan {
  month: string;
  lines: PlanLine[];
  /** True when there is nothing to buy or sell this month. */
  noAction: boolean;
  summary: string;
  notes: string[];
}

type Sleeve = 'indexCore' | 'satellite' | 'cash';
const SLEEVES: Sleeve[] = ['indexCore', 'satellite', 'cash'];
const SLEEVE_LABEL: Record<Sleeve, string> = {
  indexCore: 'Index core',
  satellite: 'Satellite',
  cash: 'Cash',
};
const CADENCE_MONTHS = { annual: 12, semiannual: 6, quarterly: 3 } as const;

/** Split a whole-rupee total in proportion to weights (largest-remainder; ties
 * go to the earlier entry). The parts always add back up to `total`. */
export function apportion(total: number, weights: number[]): number[] {
  const whole = Math.max(0, Math.round(total));
  const sum = weights.reduce((a, b) => a + b, 0);
  if (weights.length === 0) return [];
  if (sum <= 0) return weights.map(() => 0);
  const exact = weights.map((w) => (whole * w) / sum);
  const parts = exact.map(Math.floor);
  let left = whole - parts.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (left <= 0) break;
    parts[i] += 1;
    left -= 1;
  }
  return parts;
}

function monthsBetween(fromIso: string, toIso: string): number {
  const [fy, fm] = fromIso.split('-').map(Number);
  const [ty, tm] = toIso.split('-').map(Number);
  return (ty - fy) * 12 + (tm - fm);
}

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

export function computeMonthlyPlan(input: PlanInput): MonthlyPlan {
  const { policy, asOf } = input;
  const month = asOf.slice(0, 7);
  const lines: PlanLine[] = [];
  const notes: string[] = [];
  const target = policy.targetAllocation;
  const targetPct: Record<Sleeve, number> = {
    indexCore: target.indexCorePct,
    satellite: target.satellitePct,
    cash: target.cashPct,
  };

  // 1. How much new money is available this month.
  const tranchesDone = input.lumpSumTranchesDeployed ?? 0;
  const lump = policy.lumpSumINR ?? 0;
  let trancheAmount = 0;
  if (lump > 0 && tranchesDone < policy.trancheMonths) {
    const tranches = apportion(lump, Array(policy.trancheMonths).fill(1));
    trancheAmount = tranches[tranchesDone];
  }
  const monthly = Math.round(policy.monthlyContributionINR);
  const deployable = monthly + trancheAmount;

  const sourceRule =
    trancheAmount > 0
      ? `Monthly contribution ${inr(monthly)} + lump-sum tranche ${tranchesDone + 1} of ${policy.trancheMonths} (${inr(trancheAmount)})`
      : `Monthly contribution ${inr(monthly)}`;

  // 2. Rebalance check (only when sleeve values are known).
  const snap = input.portfolio ?? null;
  const total = snap ? snap.indexCoreValueINR + snap.satelliteValueINR + snap.cashINR : 0;
  const cadence = CADENCE_MONTHS[policy.rebalanceCadence];
  const due = !input.lastRebalancedOn || monthsBetween(input.lastRebalancedOn, asOf) >= cadence;
  let split: number[] = apportion(deployable, SLEEVES.map((s) => targetPct[s]));
  let splitRule = `target allocation ${target.indexCorePct}/${target.satellitePct}/${target.cashPct} (index/satellite/cash)`;

  if (snap && total > 0) {
    const current: Record<Sleeve, number> = {
      indexCore: snap.indexCoreValueINR,
      satellite: snap.satelliteValueINR,
      cash: snap.cashINR,
    };
    const drifts = SLEEVES.map((s) => ({ s, drift: (current[s] / total) * 100 - targetPct[s] }));
    const breached = drifts.filter((d) => Math.abs(d.drift) > policy.rebalanceBandPct);
    if (breached.length > 0 && due) {
      const desired = (s: Sleeve) => (targetPct[s] / 100) * (total + deployable);
      const need = SLEEVES.map((s) => Math.max(0, desired(s) - current[s]));
      if (deployable > 0 && need.some((n) => n > 0)) {
        split = apportion(deployable, need);
        splitRule = `new money directed to under-weight sleeves first (rebalance band ±${policy.rebalanceBandPct}% breached)`;
      }
      notes.push(
        `Rebalance review due (${policy.rebalanceCadence}): ` +
          breached
            .map((d) => `${SLEEVE_LABEL[d.s]} is ${d.drift > 0 ? '+' : ''}${d.drift.toFixed(1)} pts from target`)
            .join('; ') +
          '.',
      );
      if (policy.taxAware) {
        notes.push('Tax-aware: this plan rebalances with new money and does not sell.');
      } else {
        for (const s of SLEEVES) {
          const over = current[s] - desired(s);
          const d = drifts.find((x) => x.s === s)!.drift;
          if (s !== 'cash' && d > policy.rebalanceBandPct && over > 0) {
            lines.push({
              kind: 'rebalance_sell',
              target: `${SLEEVE_LABEL[s]} sleeve`,
              amountINR: Math.round(over),
              rule: `Over-weight by ${d.toFixed(1)} pts, beyond the ±${policy.rebalanceBandPct}% band`,
            });
          }
        }
      }
    } else if (breached.length > 0) {
      notes.push(
        `Allocation has drifted past the ±${policy.rebalanceBandPct}% band, but your ${policy.rebalanceCadence} rebalance is not due yet — no action.`,
      );
    }
  } else if (!snap) {
    notes.push('Current holdings were not provided, so rebalancing was not checked.');
  }

  // 3. Turn the split into lines.
  const [coreAmt, satAmt, cashAmt] = split;
  if (coreAmt > 0) {
    const parts = apportion(coreAmt, policy.indexCoreHoldings.map((h) => h.weightPct));
    policy.indexCoreHoldings.forEach((h, i) => {
      if (parts[i] > 0) {
        lines.push({
          kind: 'buy_index',
          target: h.name,
          amountINR: parts[i],
          rule: `${sourceRule}, split by ${splitRule}; ${h.weightPct}% of the index core`,
        });
      }
    });
  }
  if (satAmt > 0) {
    lines.push({
      kind: 'hold_satellite',
      target: 'Satellite sleeve',
      amountINR: satAmt,
      rule: `${sourceRule}, split by ${splitRule}. No stock has passed the quality screen yet, so this stays in cash — buying nothing is the default.`,
    });
  }
  if (cashAmt > 0) {
    lines.push({
      kind: 'hold_cash',
      target: 'Cash',
      amountINR: cashAmt,
      rule: `${sourceRule}, split by ${splitRule}`,
    });
  }

  const actionable = lines.some(
    (l) => (l.kind === 'buy_index' || l.kind === 'rebalance_sell') && l.amountINR > 0,
  );
  const noAction = !actionable;
  const actionCount = lines.filter((l) => l.kind === 'buy_index' || l.kind === 'rebalance_sell').length;
  return {
    month,
    lines,
    noAction,
    summary: noAction
      ? 'No action this month.'
      : `${actionCount} ${actionCount === 1 ? 'action' : 'actions'} for ${month}.`,
    notes,
  };
}

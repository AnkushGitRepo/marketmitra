import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, type InvestmentPolicy } from '../policy/schema';
import { apportion, computeMonthlyPlan } from './core';

const policy = (over: Partial<InvestmentPolicy> = {}): InvestmentPolicy => ({
  ...DEFAULT_POLICY,
  monthlyContributionINR: 30000,
  indexCoreHoldings: [
    { name: 'Nifty 50', weightPct: 60 },
    { name: 'Nifty Next 50', weightPct: 40 },
  ],
  ...over,
});

describe('apportion', () => {
  it('always sums back to the total', () => {
    expect(apportion(100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(apportion(10001, [70, 20, 10])).toEqual([7001, 2000, 1000]);
  });
  it('is deterministic on ties (earlier wins)', () => {
    expect(apportion(2, [1, 1, 1])).toEqual([1, 1, 0]);
  });
  it('handles zero weights and totals', () => {
    expect(apportion(100, [0, 0])).toEqual([0, 0]);
    expect(apportion(0, [1, 2])).toEqual([0, 0]);
  });
});

describe('computeMonthlyPlan', () => {
  it('splits the contribution by target allocation and index weights', () => {
    const plan = computeMonthlyPlan({ policy: policy(), asOf: '2026-11-07' });
    const buys = plan.lines.filter((l) => l.kind === 'buy_index');
    expect(buys.map((b) => [b.target, b.amountINR])).toEqual([
      ['Nifty 50', 12600],
      ['Nifty Next 50', 8400],
    ]);
    expect(plan.lines.find((l) => l.kind === 'hold_satellite')?.amountINR).toBe(6000);
    expect(plan.lines.find((l) => l.kind === 'hold_cash')?.amountINR).toBe(3000);
    expect(plan.noAction).toBe(false);
    expect(plan.summary).toBe('2 actions for 2026-11.');
    expect(plan.lines.every((l) => l.rule.length > 0)).toBe(true);
  });

  it('is identical for identical input', () => {
    const a = computeMonthlyPlan({ policy: policy(), asOf: '2026-11-07' });
    const b = computeMonthlyPlan({ policy: policy(), asOf: '2026-11-07' });
    expect(a).toEqual(b);
  });

  it('says no action when there is nothing to deploy', () => {
    const plan = computeMonthlyPlan({ policy: policy({ monthlyContributionINR: 0 }), asOf: '2026-11-07' });
    expect(plan.noAction).toBe(true);
    expect(plan.summary).toBe('No action this month.');
  });

  it('never buys the satellite sleeve in phase 1 — parks it', () => {
    const plan = computeMonthlyPlan({ policy: policy(), asOf: '2026-11-07' });
    expect(plan.lines.some((l) => l.kind === 'buy_index' && l.target === 'Satellite sleeve')).toBe(false);
  });

  it('deploys a lump sum in equal tranches and then stops', () => {
    const p = policy({ monthlyContributionINR: 0, lumpSumINR: 60000, trancheMonths: 6 });
    const first = computeMonthlyPlan({ policy: p, asOf: '2026-11-07', lumpSumTranchesDeployed: 0 });
    expect(first.lines.filter((l) => l.kind === 'buy_index').reduce((a, l) => a + l.amountINR, 0)).toBe(7000);
    const done = computeMonthlyPlan({ policy: p, asOf: '2027-05-07', lumpSumTranchesDeployed: 6 });
    expect(done.noAction).toBe(true);
  });

  it('keeps tranche remainders so the whole lump sum is deployed', () => {
    const p = policy({ monthlyContributionINR: 0, lumpSumINR: 100, trancheMonths: 3, targetAllocation: { indexCorePct: 100, satellitePct: 0, cashPct: 0 } });
    const total = [0, 1, 2].reduce(
      (sum, i) =>
        sum +
        computeMonthlyPlan({ policy: p, asOf: '2026-11-07', lumpSumTranchesDeployed: i }).lines.reduce(
          (a, l) => a + l.amountINR,
          0,
        ),
      0,
    );
    expect(total).toBe(100);
  });

  it('tax-aware rebalancing directs new money to the under-weight sleeve and never sells', () => {
    const plan = computeMonthlyPlan({
      policy: policy({ taxAware: true }),
      asOf: '2026-11-07',
      lastRebalancedOn: '2025-10-01',
      portfolio: { indexCoreValueINR: 500000, satelliteValueINR: 400000, cashINR: 100000 },
    });
    expect(plan.lines.some((l) => l.kind === 'rebalance_sell')).toBe(false);
    expect(plan.notes.join(' ')).toMatch(/does not sell/);
    const buys = plan.lines.filter((l) => l.kind === 'buy_index').reduce((a, l) => a + l.amountINR, 0);
    expect(buys).toBeGreaterThan(21000); // more than the plain 70% share
  });

  it('suggests sells only when not tax-aware and past the band', () => {
    const plan = computeMonthlyPlan({
      policy: policy({ taxAware: false }),
      asOf: '2026-11-07',
      lastRebalancedOn: null,
      portfolio: { indexCoreValueINR: 500000, satelliteValueINR: 400000, cashINR: 100000 },
    });
    expect(plan.lines.some((l) => l.kind === 'rebalance_sell' && l.target === 'Satellite sleeve')).toBe(true);
  });

  it('does not rebalance before the cadence is due', () => {
    const plan = computeMonthlyPlan({
      policy: policy({ taxAware: false }),
      asOf: '2026-11-07',
      lastRebalancedOn: '2026-08-01',
      portfolio: { indexCoreValueINR: 500000, satelliteValueINR: 400000, cashINR: 100000 },
    });
    expect(plan.lines.some((l) => l.kind === 'rebalance_sell')).toBe(false);
    expect(plan.notes.join(' ')).toMatch(/not due yet/);
  });
});

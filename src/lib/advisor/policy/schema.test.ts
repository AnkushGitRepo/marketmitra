import { describe, expect, it } from 'vitest';
import { DEFAULT_POLICY, policySchema } from './schema';
import { exportPolicy, importPolicy } from './io';

const valid = { ...DEFAULT_POLICY, monthlyContributionINR: 25000 };

describe('policySchema', () => {
  it('accepts the default policy', () => {
    expect(policySchema.safeParse(valid).success).toBe(true);
  });
  it('applies defaults for the optional rules', () => {
    const { maxPositionPct, maxSatelliteStocks, minHoldMonths, trancheMonths, rebalanceBandPct, rebalanceCadence, taxAware } = valid;
    const minimal = policySchema.parse({
      monthlyContributionINR: 1000,
      horizonYears: 10,
      maxTolerableDrawdownPct: 30,
      targetAllocation: valid.targetAllocation,
      indexCoreHoldings: valid.indexCoreHoldings,
    });
    expect({ ...minimal }).toMatchObject({ maxPositionPct, maxSatelliteStocks, minHoldMonths, trancheMonths, rebalanceBandPct, rebalanceCadence, taxAware });
  });
  it('rejects an allocation that does not sum to 100', () => {
    const r = policySchema.safeParse({ ...valid, targetAllocation: { indexCorePct: 60, satellitePct: 20, cashPct: 10 } });
    expect(r.success).toBe(false);
  });
  it('rejects index weights that do not sum to 100', () => {
    const r = policySchema.safeParse({ ...valid, indexCoreHoldings: [{ name: 'A', weightPct: 50 }] });
    expect(r.success).toBe(false);
  });
  it('requires index holdings when the index core is funded', () => {
    expect(policySchema.safeParse({ ...valid, indexCoreHoldings: [] }).success).toBe(false);
  });
  it('rejects duplicate index names', () => {
    const r = policySchema.safeParse({
      ...valid,
      indexCoreHoldings: [{ name: 'A', weightPct: 50 }, { name: 'a', weightPct: 50 }],
    });
    expect(r.success).toBe(false);
  });
  it('rejects a satellite sleeve the position limits can never fill', () => {
    const r = policySchema.safeParse({ ...valid, maxPositionPct: 2, maxSatelliteStocks: 3 });
    expect(r.success).toBe(false);
  });
  it('rejects out-of-range values', () => {
    expect(policySchema.safeParse({ ...valid, maxTolerableDrawdownPct: 0 }).success).toBe(false);
    expect(policySchema.safeParse({ ...valid, monthlyContributionINR: -1 }).success).toBe(false);
  });
});

describe('policy import/export', () => {
  it('round-trips', () => {
    const res = importPolicy(exportPolicy(policySchema.parse(valid)));
    expect(res).toEqual({ ok: true, policy: policySchema.parse(valid) });
  });
  it('accepts a bare policy object', () => {
    expect(importPolicy(JSON.stringify(valid)).ok).toBe(true);
  });
  it('reports invalid JSON and invalid policies', () => {
    expect(importPolicy('{nope').ok).toBe(false);
    const bad = importPolicy(JSON.stringify({ ...valid, horizonYears: 0 }));
    expect(bad.ok).toBe(false);
  });
  it('refuses an unknown file version', () => {
    const r = importPolicy(JSON.stringify({ format: 'marketmitra.advisor.policy', version: 99, policy: valid }));
    expect(r.ok).toBe(false);
  });
});

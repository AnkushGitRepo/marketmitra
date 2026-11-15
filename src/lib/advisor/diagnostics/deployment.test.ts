import { describe, expect, it } from 'vitest';
import { scanForTradeActions } from '@/lib/agents/tradeActionCheck';
import { HOLDINGS } from './fixtures';
import { simulateDeployment } from './deployment';

const LIMITS = { maxStockPct: 25, maxSectorPct: 50 };
const TARGET = { indexCorePct: 50, satellitePct: 30, cashPct: 20 };

describe('simulateDeployment', () => {
  it('splits new money by the target allocation and adds back up to the amount', () => {
    const r = simulateDeployment({ holdings: HOLDINGS, amountINR: 10000, limits: LIMITS, target: TARGET });
    expect(r.sleeves.map((s) => s.amountINR)).toEqual([5000, 3000, 2000]);
    expect(r.sleeves.reduce((a, s) => a + s.amountINR, 0)).toBe(10000);
  });

  it('shows how far an over-limit stock or sector falls if the money goes elsewhere', () => {
    const r = simulateDeployment({ holdings: HOLDINGS, amountINR: 1000, limits: LIMITS, target: TARGET });
    const aaa = r.gaps.find((g) => g.name === 'AAA')!;
    expect(aaa.kind).toBe('stock');
    expect(aaa.beforePct).toBeCloseTo(40, 1);
    expect(aaa.afterPct).toBeCloseTo(20, 1);
    expect(aaa.neededINR).toBeCloseTo(600, 0);
    expect(aaa.closesGap).toBe(true);
    const fin = r.gaps.find((g) => g.name === 'Financials')!;
    expect(fin.neededINR).toBeCloseTo(200, 0);
  });

  it('says the amount only partly closes a gap when it is too small', () => {
    const r = simulateDeployment({ holdings: HOLDINGS, amountINR: 100, limits: LIMITS, target: TARGET });
    expect(r.gaps.find((g) => g.name === 'AAA')?.closesGap).toBe(false);
  });

  it('lists room only under sectors that are within their limit', () => {
    const r = simulateDeployment({ holdings: HOLDINGS, amountINR: 1000, limits: LIMITS, target: TARGET });
    const health = r.room.find((x) => x.sector === 'Health')!;
    expect(health.roomINR).toBeCloseTo(700, 0); // 50% of 2,000 = 1,000, less the 300 held
    expect(r.room.find((x) => x.sector === 'Financials')).toBeUndefined();
    for (const x of r.room) expect(x.roomINR).toBeGreaterThanOrEqual(0);
  });

  it('is a no-action result when nothing is over a limit', () => {
    const r = simulateDeployment({ holdings: HOLDINGS, amountINR: 1000, limits: { maxStockPct: 90, maxSectorPct: 90 }, target: TARGET });
    expect(r.gaps).toEqual([]);
    expect(r.noGaps).toBe(true);
    expect(r.notes.join(' ')).toContain('Nothing is over a limit');
  });

  it('handles zero amount and empty holdings', () => {
    expect(simulateDeployment({ holdings: HOLDINGS, amountINR: 0, limits: LIMITS, target: TARGET }).sleeves).toEqual([]);
    const empty = simulateDeployment({ holdings: [], amountINR: 1000, limits: LIMITS, target: TARGET });
    expect(empty.gaps).toEqual([]);
    expect(empty.sleeves.reduce((a, s) => a + s.amountINR, 0)).toBe(1000);
  });

  it('never uses trade-call wording', () => {
    const r = simulateDeployment({ holdings: HOLDINGS, amountINR: 1000, limits: LIMITS, target: TARGET });
    const text = [...r.notes, ...r.sleeves.map((s) => s.rule), ...r.gaps.map((g) => g.text)].join(' ');
    expect(scanForTradeActions(text).ok).toBe(true);
    expect(text).not.toMatch(/\b(buy|sell|trim)\b/i);
  });
});

import { describe, expect, it } from 'vitest';
import {
  MIN_BREADTH_COVERAGE,
  NIFTY50_SYMBOLS,
  SECTOR_INDICES,
  computeBreadth,
  rankSectors,
  sectorBarScale,
} from './marketPulse';
import { createTtlCache } from './ttlCache';

describe('constants', () => {
  it('lists NIFTY 50 once each and sector tickers uniquely', () => {
    expect(NIFTY50_SYMBOLS).toHaveLength(new Set(NIFTY50_SYMBOLS).size);
    expect(NIFTY50_SYMBOLS.length).toBeGreaterThanOrEqual(48);
    expect(SECTOR_INDICES.map((s) => s.ticker)).toHaveLength(new Set(SECTOR_INDICES.map((s) => s.ticker)).size);
  });
});

describe('computeBreadth', () => {
  const changes = (adv: number, dec: number, flat: number) => [
    ...Array<number>(adv).fill(1.2),
    ...Array<number>(dec).fill(-0.8),
    ...Array<number>(flat).fill(0),
  ];

  it('counts advances, declines and unchanged and derives the share and ratio', () => {
    const b = computeBreadth(changes(30, 15, 5));
    expect(b).toEqual({ advances: 30, declines: 15, unchanged: 5, total: 50, advancePct: 60, ratio: 2 });
  });

  it('has no ratio when nothing declined', () => {
    expect(computeBreadth(changes(50, 0, 0))?.ratio).toBeNull();
  });

  it('ignores non-finite values', () => {
    const b = computeBreadth([...changes(30, 10, 0), Number.NaN, Number.POSITIVE_INFINITY]);
    expect(b?.total).toBe(40);
  });

  it('refuses to report breadth when too few constituents priced', () => {
    expect(computeBreadth(changes(5, 5, 0))).toBeNull();
    expect(computeBreadth(changes(MIN_BREADTH_COVERAGE, 0, 0))).not.toBeNull();
  });
});

describe('rankSectors / sectorBarScale', () => {
  const rows = [
    { label: 'IT', changePct: -1.2 },
    { label: 'Bank', changePct: 1.5 },
    { label: 'Auto', changePct: 0.3 },
  ];

  it('sorts best first without mutating the input', () => {
    const copy = [...rows];
    expect(rankSectors(rows).map((r) => r.label)).toEqual(['Bank', 'Auto', 'IT']);
    expect(rows).toEqual(copy);
  });

  it('scales bars to the largest absolute move, with a floor', () => {
    expect(sectorBarScale(rows)).toBe(1.5);
    expect(sectorBarScale([{ label: 'x', changePct: 0.01 }])).toBe(0.5);
    expect(sectorBarScale([])).toBe(0.5);
  });
});

describe('createTtlCache', () => {
  it('serves a fresh value without recomputing, then recomputes after the ttl', async () => {
    let now = 0;
    let calls = 0;
    const cache = createTtlCache<number>(1000, () => now);
    const load = async () => ++calls;
    expect(await cache.get('k', load)).toBe(1);
    now = 500;
    expect(await cache.get('k', load)).toBe(1);
    now = 1500;
    expect(await cache.get('k', load)).toBe(2);
  });

  it('shares one in-flight load between concurrent callers', async () => {
    let calls = 0;
    const cache = createTtlCache<number>(1000, () => 0);
    const load = async () => {
      calls += 1;
      return calls;
    };
    const [a, b] = await Promise.all([cache.get('k', load), cache.get('k', load)]);
    expect(a).toBe(b);
    expect(calls).toBe(1);
  });

  it('does not cache a failed load', async () => {
    const cache = createTtlCache<number>(1000, () => 0);
    await expect(cache.get('k', async () => Promise.reject(new Error('boom')))).rejects.toThrow('boom');
    expect(await cache.get('k', async () => 7)).toBe(7);
  });
});

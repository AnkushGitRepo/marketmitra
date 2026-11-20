import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIEF_SPECS } from '@/lib/ai/briefSpecs';
import { readStoredBrief } from '@/lib/ai/structuredBrief';
import { stampWriteUp } from './xrayCache';

const state = { holdings: (async () => []) as () => Promise<unknown[]> };
vi.mock('@/lib/dashboard/enrichedHoldings', () => ({ getEnrichedHoldings: () => state.holdings() }));
vi.mock('@/lib/insights', () => ({ hashInput: (v: unknown) => JSON.stringify(v) }));
vi.mock('./api', () => ({ getFund: vi.fn(), getFundPeers: vi.fn(), getFundFacets: vi.fn() }));

const { loadHoldings, xrayInputHash } = await import('./xrayServer');

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('loadHoldings', () => {
  it('returns the holdings when they arrive in time', async () => {
    state.holdings = async () => [{ symbol: 'A' }];
    await expect(loadHoldings('u1', 1000)).resolves.toEqual([{ symbol: 'A' }]);
  });

  it('returns null, not an empty list, when they are too slow: late is not the same as none', async () => {
    state.holdings = () => new Promise(() => undefined);
    const pending = loadHoldings('u1', 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBeNull();
  });

  it('leaves no timer running once the holdings are in', async () => {
    state.holdings = async () => [];
    await loadHoldings('u1', 1000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('xrayInputHash', () => {
  const items = [{ key: 'role', tone: 'neutral', text: 'a' }] as const;

  it('changes when a finding changes, and not otherwise', () => {
    expect(xrayInputHash(items)).toBe(xrayInputHash([...items]));
    expect(xrayInputHash(items)).not.toBe(xrayInputHash([{ ...items[0], text: 'b' }]));
    expect(xrayInputHash(items)).not.toBe(xrayInputHash([{ ...items[0], tone: 'warning' }]));
  });
});

describe('a stamped write-up still reads as a brief', () => {
  it('is understood by the same reader the card uses', () => {
    const content = JSON.stringify({
      items: [
        { key: 'role', tone: 'neutral', text: 'One.' },
        { key: 'overlap', tone: 'neutral', text: 'Two.' },
        { key: 'cost', tone: 'positive', text: 'Three.' },
      ],
    });
    const brief = readStoredBrief(stampWriteUp(content, 'abc'), BRIEF_SPECS.fund);
    expect(brief?.items.map((i) => i.key)).toEqual(['role', 'overlap', 'cost']);
  });
});

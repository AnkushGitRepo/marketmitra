import { beforeEach, describe, expect, it, vi } from 'vitest';
import { healthy, year } from '../screen/fixtures';
import type { JournalEntry } from './types';

const entries: Array<JournalEntry & { userId: string }> = [];
vi.mock('./store', () => ({
  listMonitoredEntries: vi.fn(async () => entries),
  appendFiring: vi.fn(async () => undefined),
}));
vi.mock('../screen/fetch', () => ({ loadScreenData: vi.fn() }));
vi.mock('@/lib/notifications/deliver', () => ({
  deliverNotification: vi.fn(async () => ({})),
  resolveChannels: vi.fn(async () => ({})),
}));

import { deliverNotification } from '@/lib/notifications/deliver';
import { loadScreenData } from '../screen/fetch';
import { appendFiring } from './store';
import { killKey } from './killMonitor';
import { runKillReview } from './review';

const rocePrecondition = { description: 'ROCE below 12% for two years', metric: 'roce_pct' as const, operator: '<' as const, threshold: 12, consecutivePeriods: 2, periodUnit: 'year' as const, source: 'memo' as const };
const entry = (over: Partial<JournalEntry> = {}): JournalEntry & { userId: string } => ({
  id: 'e1', userId: 'local', kind: 'stock', createdAt: '2026-01-01T00:00:00Z', symbol: 'ABC', name: 'ABC Ltd',
  priceAtTime: 100, amountINR: 10000, thesis: 't', killCriteria: [rocePrecondition], memoId: 'm1',
  snapshot: { screen: null, plan: null }, action: 'followed', actionNote: null, actionAt: null, actedAmountINR: null, killFired: [], ...over,
});
const weak = healthy({ annual: [0, 1, 2, 3, 4, 5].map((b) => year(b, b < 2 ? { profitBeforeTax: 40 } : {})) });
const okData = (data = healthy()) => ({ ok: true as const, name: 'ABC Ltd', sector: null, data });

beforeEach(() => {
  entries.length = 0;
  vi.clearAllMocks();
});

describe('runKillReview', () => {
  it('stays silent when no criterion has fired', async () => {
    entries.push(entry());
    vi.mocked(loadScreenData).mockResolvedValue(okData());
    const s = await runKillReview('2026-11-07');
    expect(s.fired).toEqual([]);
    expect(deliverNotification).not.toHaveBeenCalled();
  });

  it('notifies once when a criterion fires, and records it first', async () => {
    entries.push(entry());
    vi.mocked(loadScreenData).mockResolvedValue(okData(weak));
    const s = await runKillReview('2026-11-07');
    expect(s.fired).toHaveLength(1);
    expect(appendFiring).toHaveBeenCalledTimes(1);
    expect(deliverNotification).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(deliverNotification).mock.calls[0][1];
    expect(payload.title).toContain('ABC');
    expect(payload.body).toMatch(/nothing has been sold/);
  });

  it('does not repeat a criterion that already fired', async () => {
    entries.push(entry({ killFired: [{ key: killKey(rocePrecondition), description: 'x', at: '2026-06-01', observed: [] }] }));
    vi.mocked(loadScreenData).mockResolvedValue(okData(weak));
    const s = await runKillReview('2026-11-07');
    expect(s.fired).toEqual([]);
    expect(deliverNotification).not.toHaveBeenCalled();
  });

  it('never fires on unknown data, and counts it', async () => {
    entries.push(entry());
    const missing = healthy({ annual: [year(0, { interest: null }), ...[1, 2, 3, 4, 5].map((b) => year(b))] });
    vi.mocked(loadScreenData).mockResolvedValue(okData(missing));
    const s = await runKillReview('2026-11-07');
    expect(s.unknown).toBe(1);
    expect(deliverNotification).not.toHaveBeenCalled();
  });

  it('reports a fetch failure without throwing', async () => {
    entries.push(entry());
    vi.mocked(loadScreenData).mockResolvedValue({ ok: false, error: 'down' });
    const s = await runKillReview('2026-11-07');
    expect(s.errors[0]).toContain('ABC');
  });

  it('loads each symbol once for several entries', async () => {
    entries.push(entry(), entry({ id: 'e2' }));
    vi.mocked(loadScreenData).mockResolvedValue(okData());
    await runKillReview('2026-11-07');
    expect(loadScreenData).toHaveBeenCalledTimes(1);
  });
});

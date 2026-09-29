import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Alert } from './types';

// --- mocks: everything that touches the network or the database ---------

const {
  listActiveAlerts,
  applyAlertTransition,
  getQuotes,
  getPrices,
  getIpos,
  listHoldings,
  deliverNotification,
  resolveChannels,
} = vi.hoisted(() => ({
  listActiveAlerts: vi.fn<() => Promise<Alert[]>>(),
  applyAlertTransition: vi.fn<(...args: unknown[]) => Promise<void>>(async () => {}),
  getQuotes: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  getPrices: vi.fn<(...args: unknown[]) => Promise<unknown[] | null>>(async () => null),
  getIpos: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(async () => []),
  listHoldings: vi.fn<(...args: unknown[]) => Promise<unknown[]>>(),
  deliverNotification: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({})),
  resolveChannels: vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({ email: false, webhook: false })),
}));

vi.mock('./store', () => ({ listActiveAlerts, applyAlertTransition }));
vi.mock('@/lib/dashboard/fundamentalsApi', () => ({ getQuotes, getPrices }));
vi.mock('@/lib/dashboard/iposApi', () => ({ getIpos }));
vi.mock('@/lib/holdings', () => ({ listHoldings }));
vi.mock('@/lib/notifications/deliver', () => ({ deliverNotification, resolveChannels }));

// import under test AFTER the mocks are registered
import { evaluateAlerts } from './evaluate';

const NOW = new Date('2026-09-07T06:00:00.000Z');

const alert = (over: Partial<Alert>): Alert => ({
  id: 'a1',
  userId: 'u1',
  type: 'price_threshold',
  symbol: 'RELIANCE',
  params: { direction: 'above', threshold: 1000 },
  note: null,
  status: 'active',
  rearm: false,
  cooldownMinutes: 60,
  armed: true,
  cooldownUntil: null,
  lastEvaluatedAt: null,
  triggeredAt: null,
  lastObservedValue: null,
  sentKeys: null,
  peakPrice: null,
  source: 'user',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const quote = (symbol: string, price: number) => ({
  symbol,
  price: String(price),
  prev_close: String(price),
  change_pct: '0',
  week52_high: String(price * 1.5),
  week52_low: String(price * 0.5),
  as_of: NOW.toISOString(),
  source_tier: 'tier2_yfinance',
});

beforeEach(() => {
  vi.clearAllMocks();
  listHoldings.mockResolvedValue([]);
  getPrices.mockResolvedValue(null);
});

describe('evaluateAlerts', () => {
  it('does nothing (no quote fetch) when there are no active alerts', async () => {
    listActiveAlerts.mockResolvedValue([]);
    const summary = await evaluateAlerts(NOW);
    expect(summary).toEqual({
      activeAlerts: 0,
      symbolsQuoted: 0,
      iposFetched: 0,
      notified: 0,
      skippedNoData: 0,
      errors: 0,
    });
    expect(getQuotes).not.toHaveBeenCalled();
  });

  it('fires a price alert that crosses its threshold and delivers once', async () => {
    listActiveAlerts.mockResolvedValue([alert({ params: { direction: 'above', threshold: 1000 } })]);
    getQuotes.mockResolvedValue([quote('RELIANCE', 1200)]);

    const summary = await evaluateAlerts(NOW);

    expect(summary.notified).toBe(1);
    expect(deliverNotification).toHaveBeenCalledOnce();
    const [userId, payload] = deliverNotification.mock.calls[0];
    expect(userId).toBe('u1');
    expect(payload).toMatchObject({ kind: 'alert' });
    const [id, patch] = applyAlertTransition.mock.calls[0] as [string, Record<string, unknown>];
    expect(id).toBe('a1');
    expect(patch.status).toBe('triggered');
  });

  it('does not fire when the condition is not met, but still records the observation', async () => {
    listActiveAlerts.mockResolvedValue([alert({ params: { direction: 'above', threshold: 5000 } })]);
    getQuotes.mockResolvedValue([quote('RELIANCE', 1200)]);

    const summary = await evaluateAlerts(NOW);

    expect(summary.notified).toBe(0);
    expect(deliverNotification).not.toHaveBeenCalled();
    const [, patch] = applyAlertTransition.mock.calls[0] as [string, Record<string, unknown>];
    expect(patch.lastObservedValue).toBe(1200);
    expect(patch.status).toBeUndefined();
  });

  it('skips (skippedNoData) an alert whose symbol has no quote — never fires on missing data', async () => {
    listActiveAlerts.mockResolvedValue([alert({})]);
    getQuotes.mockResolvedValue([]); // upstream returned nothing

    const summary = await evaluateAlerts(NOW);

    expect(summary).toMatchObject({ activeAlerts: 1, skippedNoData: 1, notified: 0 });
    expect(deliverNotification).not.toHaveBeenCalled();
    const [, patch] = applyAlertTransition.mock.calls[0] as [string, Record<string, unknown>];
    expect(patch.status).toBeUndefined();
  });

  it("fires a trailing_stop alert once price falls trailPct% below its ratcheted peak, and persists the peak every cycle", async () => {
    listActiveAlerts.mockResolvedValue([
      alert({ type: 'trailing_stop', params: { trailPct: 10 }, peakPrice: 200 }),
    ]);
    getQuotes.mockResolvedValue([quote('RELIANCE', 175)]); // 175 <= 200 * 0.9 = 180 -> triggers

    const summary = await evaluateAlerts(NOW);

    expect(summary.notified).toBe(1);
    const [, patch] = applyAlertTransition.mock.calls[0] as [string, Record<string, unknown>];
    expect(patch.peakPrice).toBe(200); // unchanged — price fell, didn't make a new high
  });

  it("does not fire a trailing_stop alert above its floor, but still ratchets the peak up", async () => {
    listActiveAlerts.mockResolvedValue([
      alert({ type: 'trailing_stop', params: { trailPct: 10 }, peakPrice: 200 }),
    ]);
    getQuotes.mockResolvedValue([quote('RELIANCE', 250)]); // new high, floor becomes 225

    const summary = await evaluateAlerts(NOW);

    expect(summary.notified).toBe(0);
    const [, patch] = applyAlertTransition.mock.calls[0] as [string, Record<string, unknown>];
    expect(patch.peakPrice).toBe(250);
  });

  it("fires a cumulative_drawdown alert on a multi-session slide even with a flat day today", async () => {
    listActiveAlerts.mockResolvedValue([
      alert({ type: 'cumulative_drawdown', params: { windowSessions: 4, pct: 15 } }),
    ]);
    getQuotes.mockResolvedValue([quote('RELIANCE', 60)]); // today's live price
    getPrices.mockResolvedValue([
      { trade_date: '2026-09-01', close: '100' },
      { trade_date: '2026-09-02', close: '90' },
      { trade_date: '2026-09-03', close: '80' },
      { trade_date: '2026-09-04', close: '70' },
      { trade_date: '2026-09-05', close: '65' },
    ]); // 4 sessions before the most recent bar (idx 0) -> 100; (60-100)/100 = -40%

    const summary = await evaluateAlerts(NOW);

    expect(summary.notified).toBe(1);
    expect(getPrices).toHaveBeenCalledWith('RELIANCE', '1mo');
  });

  it("skips (skippedNoData) a cumulative_drawdown alert when there isn't enough price history yet", async () => {
    listActiveAlerts.mockResolvedValue([
      alert({ type: 'cumulative_drawdown', params: { windowSessions: 4, pct: 15 } }),
    ]);
    getQuotes.mockResolvedValue([quote('RELIANCE', 60)]);
    getPrices.mockResolvedValue([{ trade_date: '2026-09-05', close: '65' }]); // too few bars

    const summary = await evaluateAlerts(NOW);

    expect(summary).toMatchObject({ skippedNoData: 1, notified: 0 });
  });

    it('evaluates a whole-portfolio P&L alert against the user\'s holdings + quotes', async () => {
    listActiveAlerts.mockResolvedValue([
      alert({
        id: 'p1',
        type: 'portfolio_pnl',
        symbol: null,
        params: { metric: 'unrealized_pnl', direction: 'above', threshold: 1000 },
      }),
    ]);
    listHoldings.mockResolvedValue([
      { id: 'h1', userId: 'u1', symbol: 'RELIANCE', quantity: 10, avgPrice: 100, createdAt: NOW, updatedAt: NOW },
    ]);
    getQuotes.mockResolvedValue([quote('RELIANCE', 300)]); // value 3000, cost 1000, pnl +2000

    const summary = await evaluateAlerts(NOW);

    expect(listHoldings).toHaveBeenCalledWith('u1');
    expect(summary.notified).toBe(1);
    expect(getQuotes.mock.calls[0][0]).toContain('RELIANCE');
  });

  it('ipo_watch: notifies once per (IPO, trigger) and stores sentKeys', async () => {
    listActiveAlerts.mockResolvedValue([
      alert({
        id: 'w1',
        type: 'ipo_watch',
        symbol: null,
        params: { triggers: { opens: true, lastDay: true, allotmentListing: true }, ipoType: 'all' },
        sentKeys: [],
      }),
    ]);
    getIpos.mockResolvedValue([
      { slug: 'a-ipo', name: 'A', category: 'mainboard', status: 'open', gmp: null, gmp_pct: null,
        open_date: '2026-09-07', close_date: null, allotment_date: null, listing_date: null },
    ]);

    const summary = await evaluateAlerts(new Date('2026-09-07T06:00:00Z')); // 2026-09-07 IST

    expect(summary.iposFetched).toBe(1);
    expect(summary.notified).toBe(1);
    const [, patch] = applyAlertTransition.mock.calls[0] as [string, Record<string, unknown>];
    expect(patch.sentKeys).toEqual(['a-ipo:opens']);
  });

  it('ipo_watch: does not re-notify keys already sent', async () => {
    listActiveAlerts.mockResolvedValue([
      alert({
        id: 'w1', type: 'ipo_watch', symbol: null,
        params: { triggers: { opens: true, lastDay: false, allotmentListing: false }, ipoType: 'all' },
        sentKeys: ['a-ipo:opens'],
      }),
    ]);
    getIpos.mockResolvedValue([
      { slug: 'a-ipo', name: 'A', category: 'mainboard', status: 'open', gmp: null, gmp_pct: null,
        open_date: '2026-09-07', close_date: null, allotment_date: null, listing_date: null },
    ]);
    const summary = await evaluateAlerts(new Date('2026-09-07T06:00:00Z'));
    expect(summary.notified).toBe(0);
    expect(deliverNotification).not.toHaveBeenCalled();
  });

  it('per-IPO ipo alert: fires on its trigger day and goes triggered', async () => {
    listActiveAlerts.mockResolvedValue([
      alert({ id: 'i1', type: 'ipo', symbol: null, params: { ipoSlug: 'a-ipo', trigger: 'opens' } }),
    ]);
    getIpos.mockResolvedValue([
      { slug: 'a-ipo', name: 'A', category: 'mainboard', status: 'open', gmp: null, gmp_pct: null,
        open_date: '2026-09-07', close_date: null, allotment_date: null, listing_date: null },
    ]);
    const summary = await evaluateAlerts(new Date('2026-09-07T06:00:00Z'));
    expect(summary.notified).toBe(1);
    const [, patch] = applyAlertTransition.mock.calls[0] as [string, Record<string, unknown>];
    expect(patch.status).toBe('triggered');
  });

  it('does not fetch /ipos when there are no ipo alerts', async () => {
    listActiveAlerts.mockResolvedValue([alert({ params: { direction: 'above', threshold: 1000 } })]);
    getQuotes.mockResolvedValue([quote('RELIANCE', 1200)]);
    await evaluateAlerts(NOW);
    expect(getIpos).not.toHaveBeenCalled();
  });

  it('counts a delivery failure as an error and keeps going', async () => {
    listActiveAlerts.mockResolvedValue([
      alert({ id: 'a1', symbol: 'RELIANCE', params: { direction: 'above', threshold: 100 } }),
      alert({ id: 'a2', symbol: 'TCS', params: { direction: 'above', threshold: 100 } }),
    ]);
    getQuotes.mockResolvedValue([quote('RELIANCE', 200), quote('TCS', 200)]);
    deliverNotification.mockRejectedValueOnce(new Error('smtp down'));

    const summary = await evaluateAlerts(NOW);

    expect(summary.errors).toBe(1);
    expect(summary.notified).toBe(1); // the second one still delivered
    expect(applyAlertTransition).toHaveBeenCalledTimes(2);
  });
});

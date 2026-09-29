import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { RetrievedChunk } from '@/lib/rag/retrieve';

const run = vi.fn<(a: unknown) => Promise<unknown>>();
vi.mock('@/lib/mcp/tools', () => ({
  tools: [
    {
      name: 'get_quote',
      config: { title: 'Quote', description: 'Live quote', inputSchema: z.object({ symbol: z.string() }) },
      run: (a: unknown) => run(a),
    },
  ],
}));

const retrieve = vi.fn<() => Promise<RetrievedChunk[] | null>>();
vi.mock('@/lib/rag/retrieve', () => ({ retrieve: () => retrieve() }));

const createAlert = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const getAlertById = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const listAlerts = vi.fn<(...args: unknown[]) => Promise<unknown[]>>();
const updateAlert = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock('@/lib/alerts/store', () => ({ createAlert, getAlertById, listAlerts, updateAlert }));

const logMitraAction = vi.fn<(...args: unknown[]) => Promise<unknown>>(async () => ({}));
vi.mock('@/lib/mitra/activityLog', () => ({ logMitraAction }));

const { buildChatTools } = await import('./chatTools');

type ExecTool = { execute: (args: unknown) => Promise<unknown> };

beforeEach(() => {
  run.mockReset();
  retrieve.mockReset();
  createAlert.mockReset();
  getAlertById.mockReset();
  listAlerts.mockReset();
  updateAlert.mockReset();
  logMitraAction.mockClear();
});

const fakeAlert = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  userId: 'u1',
  type: 'trailing_stop',
  symbol: 'RELIANCE',
  params: { trailPct: 10 },
  note: null,
  status: 'active',
  rearm: true,
  cooldownMinutes: 240,
  armed: true,
  cooldownUntil: null,
  lastEvaluatedAt: null,
  triggeredAt: null,
  lastObservedValue: null,
  sentKeys: null,
  peakPrice: null,
  source: 'mitra',
  createdAt: new Date('2026-09-29T00:00:00Z'),
  updatedAt: new Date('2026-09-29T00:00:00Z'),
  ...over,
});

describe('buildChatTools', () => {
  it('adapts every MCP tool plus search_context plus the 4 navigation tools plus the 4 alert tools', () => {
    const set = buildChatTools('u1');
    expect(Object.keys(set).sort()).toEqual([
      'create_alert',
      'get_quote',
      'list_alerts',
      'navigate_to_dashboard',
      'navigate_to_markets',
      'navigate_to_portfolio',
      'open_stock',
      'search_context',
      'set_alert_status',
      'update_alert_params',
    ]);
    expect(typeof (set.get_quote as unknown as ExecTool).execute).toBe('function');
  });

  // ADR 0022's hard boundary: settings/security/billing/destructive actions
  // must never appear in the ToolSet, under any tool name. This asserts the
  // boundary as a testable invariant rather than trusting a comment.
  it('never exposes a settings, security, billing, or delete tool', () => {
    const set = buildChatTools('u1');
    const forbidden = /settings|security|billing|subscription|delete|remove/i;
    for (const name of Object.keys(set)) {
      expect(name).not.toMatch(forbidden);
    }
  });

  it('navigate_to_dashboard/portfolio/markets resolve to their fixed route', async () => {
    const set = buildChatTools('u1');
    await expect((set.navigate_to_dashboard as unknown as ExecTool).execute({})).resolves.toEqual({
      navigated: true,
      to: '/dashboard',
    });
    await expect((set.navigate_to_portfolio as unknown as ExecTool).execute({})).resolves.toEqual({
      navigated: true,
      to: '/dashboard/portfolio',
    });
    await expect((set.navigate_to_markets as unknown as ExecTool).execute({})).resolves.toEqual({
      navigated: true,
      to: '/dashboard/markets',
    });
  });

  it('open_stock uppercases the ticker and builds the stock route', async () => {
    const set = buildChatTools('u1');
    const out = await (set.open_stock as unknown as ExecTool).execute({ ticker: 'tcs' });
    expect(out).toEqual({ navigated: true, to: '/dashboard/stock/TCS' });
  });

  it('an adapted MCP tool calls run and passes args through', async () => {
    run.mockResolvedValue({ ltp: 2500 });
    const set = buildChatTools('u1');
    const out = await (set.get_quote as unknown as ExecTool).execute({ symbol: 'RELIANCE' });
    expect(run).toHaveBeenCalledWith({ symbol: 'RELIANCE' });
    expect(out).toEqual({ ltp: 2500 });
  });

  it('an adapted MCP tool surfaces a thrown error as { error }', async () => {
    run.mockRejectedValue(new Error('upstream 502'));
    const set = buildChatTools('u1');
    expect(await (set.get_quote as unknown as ExecTool).execute({ symbol: 'X' })).toEqual({ error: 'upstream 502' });
  });

  it('search_context maps retrieved chunks to passages', async () => {
    retrieve.mockResolvedValue([
      {
        text: 'Reliance guided to higher capex.',
        score: 0.827_3,
        source: 'https://x/a',
        sourceUrl: 'https://x/a',
        title: 'Reliance ups capex',
        docType: 'news',
        symbol: 'RELIANCE',
        publishedAt: new Date('2026-09-01T00:00:00Z'),
      },
    ]);
    const set = buildChatTools('u1');
    const out = (await (set.search_context as unknown as ExecTool).execute({ query: 'why capex' })) as {
      available: boolean;
      passages: Array<Record<string, unknown>>;
    };
    expect(out.available).toBe(true);
    expect(out.passages[0]).toEqual({
      text: 'Reliance guided to higher capex.',
      source: 'Reliance ups capex',
      url: 'https://x/a',
      kind: 'news',
      published: '2026-09-01',
      score: 0.827,
    });
  });

  it('search_context reports unavailable when retrieval returns null', async () => {
    retrieve.mockResolvedValue(null);
    const set = buildChatTools(null);
    expect(await (set.search_context as unknown as ExecTool).execute({ query: 'q' })).toEqual({
      available: false,
      passages: [],
    });
  });
  describe('alert-management tools', () => {
    it('list_alerts returns the current user\'s alerts', async () => {
      listAlerts.mockResolvedValue([fakeAlert()]);
      const set = buildChatTools('u1');
      const out = (await (set.list_alerts as unknown as ExecTool).execute({})) as { alerts: unknown[] };
      expect(listAlerts).toHaveBeenCalledWith('u1');
      expect(out.alerts).toHaveLength(1);
    });

    it('list_alerts refuses without a signed-in user', async () => {
      const set = buildChatTools(null);
      expect(await (set.list_alerts as unknown as ExecTool).execute({})).toEqual({ error: 'Not signed in.' });
      expect(listAlerts).not.toHaveBeenCalled();
    });

    it('create_alert validates params, applies Mitra\'s tighter bounds, creates with source "mitra", and logs the reason', async () => {
      createAlert.mockResolvedValue(fakeAlert());
      const set = buildChatTools('u1');
      const out = await (set.create_alert as unknown as ExecTool).execute({
        type: 'trailing_stop',
        symbol: 'reliance',
        params: { trailPct: 10 },
        reason: 'No alert existed on this holding yet.',
      });
      expect(out).toMatchObject({ created: true, alertId: 'a1' });
      expect(createAlert).toHaveBeenCalledWith(
        'u1',
        expect.objectContaining({ type: 'trailing_stop', symbol: 'RELIANCE', source: 'mitra' })
      );
      expect(logMitraAction).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'alert_created', source: 'mitra', reason: 'No alert existed on this holding yet.' })
      );
    });

    it('create_alert rejects a trailing_stop % outside Mitra\'s own bounds, without creating anything', async () => {
      const set = buildChatTools('u1');
      const out = await (set.create_alert as unknown as ExecTool).execute({
        type: 'trailing_stop',
        symbol: 'RELIANCE',
        params: { trailPct: 1 }, // below the 3% floor Mitra is allowed
        reason: 'Testing an extreme trail percentage.',
      });
      expect(out).toMatchObject({ error: expect.stringContaining('between 3% and 25%') });
      expect(createAlert).not.toHaveBeenCalled();
      expect(logMitraAction).not.toHaveBeenCalled();
    });

    it('create_alert rejects invalid params for the type before touching the store', async () => {
      const set = buildChatTools('u1');
      const out = await (set.create_alert as unknown as ExecTool).execute({
        type: 'percent_move',
        symbol: 'RELIANCE',
        params: { direction: 'sideways', pct: 5 }, // not a valid direction
        reason: 'Testing invalid params.',
      });
      expect(out).toMatchObject({ error: expect.stringContaining('Invalid params') });
      expect(createAlert).not.toHaveBeenCalled();
    });

    it('create_alert requires a symbol for a symbol-scoped type', async () => {
      const set = buildChatTools('u1');
      const out = await (set.create_alert as unknown as ExecTool).execute({
        type: 'trailing_stop',
        params: { trailPct: 10 },
        reason: 'Testing a missing symbol.',
      });
      expect(out).toMatchObject({ error: expect.stringContaining('needs a symbol') });
      expect(createAlert).not.toHaveBeenCalled();
    });

    it('update_alert_params validates against the existing alert\'s own type and logs a before/after diff', async () => {
      getAlertById.mockResolvedValue(fakeAlert({ params: { trailPct: 10 } }));
      updateAlert.mockResolvedValue(fakeAlert({ params: { trailPct: 15 } }));
      const set = buildChatTools('u1');
      const out = await (set.update_alert_params as unknown as ExecTool).execute({
        alertId: 'a1',
        params: { trailPct: 15 },
        reason: 'Widening the trail after a volatile week.',
      });
      expect(out).toMatchObject({ updated: true });
      expect(logMitraAction).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'alert_updated',
          before: expect.objectContaining({ params: { trailPct: 10 } }),
          after: expect.objectContaining({ params: { trailPct: 15 } }),
        })
      );
    });

    it('update_alert_params refuses an alert id that is not the user\'s own', async () => {
      getAlertById.mockResolvedValue(null);
      const set = buildChatTools('u1');
      const out = await (set.update_alert_params as unknown as ExecTool).execute({
        alertId: 'not-mine',
        reason: 'Trying to touch another user\'s alert.',
      });
      expect(out).toMatchObject({ error: expect.stringContaining('not yours') });
      expect(updateAlert).not.toHaveBeenCalled();
    });

    it('set_alert_status pauses an active alert and logs alert_paused', async () => {
      getAlertById.mockResolvedValue(fakeAlert({ status: 'active' }));
      updateAlert.mockResolvedValue(fakeAlert({ status: 'paused' }));
      const set = buildChatTools('u1');
      const out = await (set.set_alert_status as unknown as ExecTool).execute({
        alertId: 'a1',
        status: 'paused',
        reason: 'This alert has been misfiring on normal volatility.',
      });
      expect(out).toMatchObject({ updated: true, status: 'paused' });
      expect(logMitraAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'alert_paused' }));
    });

    it('set_alert_status resumes a paused alert and logs alert_resumed, never alert_paused', async () => {
      getAlertById.mockResolvedValue(fakeAlert({ status: 'paused' }));
      updateAlert.mockResolvedValue(fakeAlert({ status: 'active' }));
      const set = buildChatTools('u1');
      const out = await (set.set_alert_status as unknown as ExecTool).execute({
        alertId: 'a1',
        status: 'active',
        reason: 'The market has calmed down since this was paused.',
      });
      expect(out).toMatchObject({ updated: true, status: 'active' });
      expect(logMitraAction).toHaveBeenCalledWith(expect.objectContaining({ action: 'alert_resumed' }));
    });

    it('set_alert_status is a no-op (and does not log) when already in the requested state', async () => {
      getAlertById.mockResolvedValue(fakeAlert({ status: 'paused' }));
      const set = buildChatTools('u1');
      const out = await (set.set_alert_status as unknown as ExecTool).execute({
        alertId: 'a1',
        status: 'paused',
        reason: 'Redundant pause request.',
      });
      expect(out).toMatchObject({ updated: false });
      expect(updateAlert).not.toHaveBeenCalled();
      expect(logMitraAction).not.toHaveBeenCalled();
    });

    it('none of the alert tools has a delete/remove tool name (ADR 0030\'s no-delete rule)', () => {
      const set = buildChatTools('u1');
      expect(Object.keys(set).some((n) => /delete|remove/i.test(n))).toBe(false);
    });
  });
});

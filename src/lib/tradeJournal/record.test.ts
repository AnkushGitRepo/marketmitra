import { beforeEach, describe, expect, it, vi } from 'vitest';

const getQuotes = vi.fn();
const getRatios = vi.fn();
vi.mock('@/lib/dashboard/fundamentalsApi', () => ({ getQuotes, getRatios }));
const listAlerts = vi.fn();
vi.mock('@/lib/alerts/store', () => ({ listAlerts }));
const listNotes = vi.fn();
vi.mock('@/lib/notes/userNotes', () => ({ listNotes }));
const insertSnapshot = vi.fn(async (_u: string, s: unknown) => ({ id: 's1', ...(s as object) }));
vi.mock('./store', () => ({ insertSnapshot }));

const { recordHoldingEvent } = await import('./record');

const note = { id: 'n1', title: 'Why TCS', body: 'Cash machine', symbol: 'TCS', tickers: [], updatedAt: new Date(2026, 0, 1) };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  getQuotes.mockResolvedValue([{ symbol: 'TCS', price: '3,500.5'.replace(',', '') }]);
  getRatios.mockResolvedValue([{ name: 'Stock P/E', value: '28.1' }, { name: 'ROCE', value: '52' }]);
  listNotes.mockResolvedValue([note]);
  listAlerts.mockResolvedValue([
    { symbol: 'TCS', status: 'active', type: 'trailing_stop' },
    { symbol: 'TCS', status: 'active', type: 'trailing_stop' },
    { symbol: 'TCS', status: 'paused', type: 'cumulative_drawdown' },
    { symbol: 'INFY', status: 'active', type: 'trailing_stop' },
    { symbol: 'TCS', status: 'active', type: 'price_threshold' },
  ]);
});

describe('recordHoldingEvent', () => {
  it('snapshots price, multiples, thesis and the active guardrails', async () => {
    await recordHoldingEvent('u1', 'tcs', null, { quantity: 10, avgPrice: 3400 }, '  long runway  ');
    expect(insertSnapshot).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({
        symbol: 'TCS', event: 'buy', marketPrice: 3500.5, pe: 28.1, roce: 52,
        thesis: { noteId: 'n1', title: 'Why TCS', body: 'Cash machine' },
        reason: 'long runway', guardrails: ['trailing_stop'],
      }),
      expect.any(Date)
    );
  });

  it('leaves a field empty, rather than guessing, when a source is down', async () => {
    getQuotes.mockRejectedValue(new Error('down'));
    getRatios.mockResolvedValue(null);
    listNotes.mockRejectedValue(new Error('db'));
    await recordHoldingEvent('u1', 'TCS', { quantity: 10, avgPrice: 3400 }, null);
    const saved = insertSnapshot.mock.calls[0][1] as Record<string, unknown>;
    expect(saved).toMatchObject({ event: 'exit', marketPrice: null, pe: null, roce: null, thesis: null, reason: null });
  });

  it('never throws when the write itself fails', async () => {
    insertSnapshot.mockRejectedValueOnce(new Error('mongo'));
    await expect(recordHoldingEvent('u1', 'TCS', null, { quantity: 1, avgPrice: 1 })).resolves.toBeNull();
  });
});

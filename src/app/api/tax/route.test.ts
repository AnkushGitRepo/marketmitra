import { beforeEach, describe, expect, it, vi } from 'vitest';

const getCurrentUserId = vi.fn(async (): Promise<string | null> => 'u1');
vi.mock('@/lib/currentUserId', () => ({ getCurrentUserId }));
const buildTaxReport = vi.fn<(userId: string, today: Date, booked: { short: number; long: number }) => Promise<object>>(async () => ({ lots: [] }));
vi.mock('@/lib/tax/report', () => ({ buildTaxReport }));
const listHoldings = vi.fn(async () => [{ id: 'h1' }]);
vi.mock('@/lib/holdings', () => ({ listHoldings }));
const setPurchaseDate = vi.fn(async () => undefined);
vi.mock('@/lib/tax/dates', () => ({ setPurchaseDate }));

const { GET } = await import('./route');
const { PUT } = await import('../holdings/[id]/purchase-date/route');

const get = (qs = '') => GET(new Request(`http://x/api/tax${qs}`));
const put = (body: unknown, id = 'h1') => PUT(new Request('http://x', { method: 'PUT', body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  getCurrentUserId.mockResolvedValue('u1');
});

describe('GET /api/tax', () => {
  it('requires sign-in', async () => {
    getCurrentUserId.mockResolvedValue(null);
    expect((await get()).status).toBe(401);
  });
  it('passes the gains already booked, defaulting to zero', async () => {
    await get();
    expect(buildTaxReport).toHaveBeenLastCalledWith('u1', expect.any(Date), { short: 0, long: 0 });
    await get('?bookedShort=10000&bookedLong=-500');
    expect(buildTaxReport).toHaveBeenLastCalledWith('u1', expect.any(Date), { short: 10000, long: -500 });
  });
  it('rejects non-numbers', async () => expect((await get('?bookedShort=abc')).status).toBe(422));
});

describe('PUT /api/holdings/[id]/purchase-date', () => {
  it('requires sign-in', async () => {
    getCurrentUserId.mockResolvedValue(null);
    expect((await put({ purchaseDate: '2025-01-01' })).status).toBe(401);
  });
  it('saves a real past date and clears with null', async () => {
    expect((await put({ purchaseDate: '2025-01-15' })).status).toBe(200);
    expect(setPurchaseDate).toHaveBeenCalledWith('u1', 'h1', '2025-01-15');
    expect((await put({ purchaseDate: null })).status).toBe(200);
    expect(setPurchaseDate).toHaveBeenLastCalledWith('u1', 'h1', null);
  });
  it('rejects impossible, future and malformed dates', async () => {
    for (const bad of ['2025-02-30', '2999-01-01', '15/01/2025', 'x']) expect((await put({ purchaseDate: bad })).status).toBe(422);
    expect((await put({})).status).toBe(422);
    expect(setPurchaseDate).not.toHaveBeenCalled();
  });
  it('answers 404 for a holding that is not the user’s', async () => expect((await put({ purchaseDate: '2025-01-01' }, 'other')).status).toBe(404));
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FundDetail } from '@/lib/funds/types';

const getFund = vi.fn();
const getFundFacets = vi.fn();
vi.mock('@/lib/funds/api', () => ({
  getFund: (code: number) => getFund(code),
  getFundFacets: () => getFundFacets(),
}));

import { GET } from './route';

const detail = (scheme_code: number, patch: Partial<FundDetail> = {}): FundDetail =>
  ({
    scheme_code, name: `Fund ${scheme_code}`, base_name: `Fund ${scheme_code}`, ret_3y: null, expense_ratio: null, ...patch,
  }) as FundDetail;

const call = (qs: string) => GET(new Request(`http://localhost/api/funds/compare${qs}`));

beforeEach(() => {
  getFund.mockReset();
  getFundFacets.mockReset();
  getFundFacets.mockResolvedValue({ categories: ['Equity'] });
});

describe('GET /api/funds/compare', () => {
  it('returns the funds in the order asked and the winner of each row', async () => {
    getFund.mockImplementation(async (code: number) => detail(code, { ret_3y: code === 2 ? 20 : 10, expense_ratio: code === 1 ? 0.2 : 0.9 }));
    const response = await call('?codes=1,2');
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.funds.map((f: FundDetail) => f.scheme_code)).toEqual([1, 2]);
    expect(body.best.ret_3y).toBe(2);
    expect(body.best.expense_ratio).toBe(1);
    expect(body.best.sharpe_3y).toBeNull();
  });

  it('adds the trade-off summary, which is plain description and never uses the portfolio (this endpoint is public)', async () => {
    getFund.mockImplementation(async (code: number) =>
      detail(code, { ret_3y: code === 2 ? 20 : 30, sharpe_3y: code === 2 ? 1.4 : 0.9, sortino_3y: code === 2 ? 1.9 : 1.1, expense_ratio: code === 2 ? 0.5 : 1.2 }),
    );
    const body = await (await call('?codes=1,2')).json();
    expect(body.summary.map((i: { key: string }) => i.key)).toEqual(['tradeoff']);
    // Counted against all five measures: only three of them have figures in this fixture.
    expect(body.summary[0].text).toContain('Fund 2 leads 3 of the 5 risk and cost measures');
    expect(body.summary[0].text).toContain('Fund 1 has the highest 3-year return (+30.00%)');
    expect(body.summary[0].text).not.toMatch(/portfolio|your holdings/i);
  });

  it('has an empty summary when nothing can be compared', async () => {
    getFund.mockImplementation(async (code: number) => detail(code));
    expect((await (await call('?codes=1,2')).json()).summary).toEqual([]);
  });

  it.each(['', '?codes=', '?codes=5', '?codes=abc,def', '?codes=7,7'])('answers 400 unless two valid codes are given (%j)', async (qs) => {
    const response = await call(qs);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe('invalid_codes');
    expect(getFund).not.toHaveBeenCalled();
  });

  it('answers 404 naming the code when one is unknown and the service is up', async () => {
    getFund.mockImplementation(async (code: number) => (code === 2 ? null : detail(code)));
    const response = await call('?codes=1,2');
    expect(response.status).toBe(404);
    expect((await response.json()).message).toContain('2');
  });

  it('answers 503 when the data service is down', async () => {
    getFund.mockResolvedValue(null);
    getFundFacets.mockResolvedValue({ categories: [] });
    expect((await call('?codes=1,2')).status).toBe(503);
  });
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FundPage, FundSummary } from '@/lib/funds/types';

const listFunds = vi.fn();
vi.mock('@/lib/funds/api', () => ({ listFunds: (filters: unknown) => listFunds(filters) }));

import { GET } from './route';

const fund = (n: number): FundSummary => ({ scheme_code: n, name: `Fund ${n}`, base_name: `Fund ${n}`, fund_house: 'AMC', category: 'Equity', plan: 'direct', option: 'growth' }) as FundSummary;
const catalogue = (total: number) => Array.from({ length: total }, (_, i) => fund(i + 1));

/** A fake data service that serves `all` in pages, the way /funds does. */
function serve(all: FundSummary[]) {
  listFunds.mockImplementation(async (f: { limit?: number; offset?: number }): Promise<FundPage> => {
    const limit = f.limit ?? 50;
    const offset = f.offset ?? 0;
    return { total: all.length, limit, offset, items: all.slice(offset, offset + limit) };
  });
}

const call = (qs = '') => GET(new Request(`http://localhost/api/funds/export${qs}`));
const body = async (r: Response) => (await r.text()).split('\r\n').filter(Boolean);

beforeEach(() => {
  listFunds.mockReset();
});

describe('GET /api/funds/export', () => {
  it('returns every matching fund across pages as a CSV download', async () => {
    serve(catalogue(450));
    const response = await call('?category=Equity');
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');
    expect(response.headers.get('content-disposition')).toMatch(/^attachment; filename="marketmitra-funds-\d{4}-\d{2}-\d{2}\.csv"$/);
    expect(response.headers.get('x-total-count')).toBe('450');
    expect((await body(response)).length).toBe(451); // header + 450 funds
    expect(listFunds.mock.calls.length).toBe(3); // 200 + 200 + 50
  });

  it('honours the filters and sort but ignores limit and offset', async () => {
    serve(catalogue(5));
    await call('?category=Equity&sort=ret_3y&order=desc&limit=2&offset=3');
    for (const [filters] of listFunds.mock.calls) {
      expect(filters).toMatchObject({ category: 'Equity', sort: 'ret_3y', order: 'desc' });
    }
    expect(listFunds.mock.calls[0][0]).toMatchObject({ offset: 0 });
  });

  it('starts the file with a BOM so Excel reads rupee text correctly', async () => {
    serve(catalogue(1));
    // Response.text() strips a leading BOM by spec, so read the raw bytes.
    const bytes = new Uint8Array(await (await call()).arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
  });

  it('rejects a bad filter with 400', async () => {
    const response = await call('?min_ret_1y=banana');
    expect(response.status).toBe(400);
    expect(listFunds).not.toHaveBeenCalled();
  });

  it('answers 503 when the data service does not answer, and never a partial file', async () => {
    listFunds.mockResolvedValue(null);
    expect((await call()).status).toBe(503);

    listFunds.mockReset();
    const all = catalogue(450);
    listFunds.mockImplementation(async (f: { limit: number; offset: number }) => (f.offset >= 200 ? null : { total: 450, limit: f.limit, offset: f.offset, items: all.slice(f.offset, f.offset + f.limit) }));
    expect((await call()).status).toBe(503);
  });

  it('exports an empty match as just the header row', async () => {
    serve([]);
    const response = await call();
    expect(response.status).toBe(200);
    expect((await body(response)).length).toBe(1);
  });
});

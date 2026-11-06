import { describe, expect, it } from 'vitest';
import { parseScreenerParams } from './params';

const parse = (qs: string) => parseScreenerParams(new URLSearchParams(qs));

describe('parseScreenerParams', () => {
  it('parses ranges, text filters, sort and paging', () => {
    expect(
      parse(
        'roe_min=15&pe_max=20&sector=Capital+Goods&q=tata&sort_by=roe&order=asc&limit=50&offset=100',
      ),
    ).toEqual({
      ok: true,
      filters: {
        roe_min: 15,
        pe_max: 20,
        sector: 'Capital Goods',
        q: 'tata',
        sort_by: 'roe',
        order: 'asc',
        limit: 50,
        offset: 100,
      },
    });
  });

  it('ignores empty values', () => {
    expect(parse('roe_min=&sector=')).toEqual({ ok: true, filters: {} });
  });

  it.each([
    ['roe_min=abc', /roe_min must be a number/],
    ['sort_by=symbol', /sort_by/],
    ['order=sideways', /order/],
    ['limit=0', /limit/],
    ['limit=501', /limit/],
    ['limit=2.5', /limit/],
    ['offset=-1', /offset/],
  ])('rejects %s', (qs, message) => {
    const result = parse(qs);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(message);
  });
});

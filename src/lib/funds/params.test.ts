import { describe, expect, it } from 'vitest';
import { buildFundsQuery, parseFundParams, FUND_SORT_KEYS, MAX_FUND_PAGE_SIZE } from './params';

const parse = (qs: string) => parseFundParams(new URLSearchParams(qs));

describe('parseFundParams', () => {
  it('parses text, enums and numbers', () => {
    const r = parse('q=flexi&category=Equity&plan=regular&option=idcw&min_ret_3y=15&max_expense_ratio=0.8&sort=sharpe_3y&order=asc&limit=25&offset=50');
    expect(r).toEqual({
      ok: true,
      filters: {
        q: 'flexi', category: 'Equity', plan: 'regular', option: 'idcw',
        min_ret_3y: 15, max_expense_ratio: 0.8, sort: 'sharpe_3y', order: 'asc', limit: 25, offset: 50,
      },
    });
  });

  it('ignores empty params and trims text', () => {
    expect(parse('q=%20%20&category=&min_ret_1y=')).toEqual({ ok: true, filters: {} });
  });

  it.each([
    ['min_ret_3y=abc'], ['min_ret_3y=Infinity'], ['plan=bogus'], ['option=x'], ['order=up'],
    ['sort=name;drop'], ['limit=0'], ['limit=-1'], ['offset=-5'], ['limit=1.5'],
  ])('rejects %s', (qs) => {
    expect(parse(qs).ok).toBe(false);
  });

  it('clamps an oversized page and long text instead of failing', () => {
    const r = parse(`limit=${MAX_FUND_PAGE_SIZE + 500}&q=${'a'.repeat(200)}`);
    expect(r.ok && r.filters.limit).toBe(MAX_FUND_PAGE_SIZE);
    expect(r.ok && r.filters.q?.length).toBe(80);
  });

  it('parses the worst-fall limit and keeps it between 0 and 100', () => {
    expect(parse('max_fall_3y=15')).toEqual({ ok: true, filters: { max_fall_3y: 15 } });
    expect(parse('max_fall_3y=-1').ok).toBe(false);
    expect(parse('max_fall_3y=101').ok).toBe(false);
  });

  it('accepts every sort key the service whitelists', () => {
    for (const key of FUND_SORT_KEYS) expect(parse(`sort=${key}`).ok).toBe(true);
  });
});

describe('buildFundsQuery', () => {
  it('serialises only set values, stably', () => {
    expect(buildFundsQuery({ category: 'Equity', min_ret_3y: 12, sort: 'ret_5y', order: 'desc' })).toBe(
      'category=Equity&min_ret_3y=12&sort=ret_5y&order=desc',
    );
    expect(buildFundsQuery({})).toBe('');
  });

  it('round-trips through the parser', () => {
    const filters = { q: 'nifty', plan: 'direct' as const, min_sharpe_3y: 0.5, limit: 50, offset: 100 };
    const parsed = parse(buildFundsQuery(filters));
    expect(parsed).toEqual({ ok: true, filters });
  });
});

describe('bounds and strict numbers', () => {
  it.each([
    ['min_ret_1y=1001'], ['min_ret_3y=-101'], ['max_expense_ratio=10.5'], ['max_expense_ratio=-1'],
    ['max_std_dev_3y=501'], ['min_sharpe_3y=21'], ['min_aum_cr=-1'], ['offset=100001'],
  ])('rejects %s as the service would (400 here, not a 503 later)', (qs) => {
    expect(parse(qs).ok).toBe(false);
  });

  it('accepts values exactly on a bound', () => {
    expect(parse('min_ret_1y=-100&max_expense_ratio=10&min_sharpe_3y=20&offset=100000').ok).toBe(true);
  });

  it.each([['min_ret_1y=%20'], ['min_ret_1y=0x10'], ['min_ret_1y=1e2'], ['min_ret_1y=1,5'], ['min_ret_1y=--1']])(
    'treats %s as invalid, never as 0',
    (qs) => expect(parse(qs).ok).toBe(false),
  );

  it('still treats a truly empty value as unset', () => {
    expect(parse('min_ret_1y=')).toEqual({ ok: true, filters: {} });
  });
});

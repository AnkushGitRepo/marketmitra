import { describe, expect, it } from 'vitest';
import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import { buildXray, median, sectorExposure, sectorsForTheme, STOCK_OVERLAP_NOTE } from './xray';
import type { FundDetail, FundSummary } from './types';

const holding = (symbol: string, sector: string | null, value: number | null): HoldingLike => ({
  symbol, name: symbol, quantity: 1, avgPrice: 1, ltp: value, sector, dayChange: null,
});

const base = {
  scheme_code: 1, name: 'X', base_name: 'X Fund', fund_house: 'X Mutual Fund', category: 'Equity', sub_category: 'Thematic Fund',
  plan: 'direct', option: 'growth', nav: 10, nav_date: '2026-11-17', ret_1m: null, ret_3m: null, ret_6m: null, ret_1y: null,
  ret_3y: null, ret_5y: null, ret_10y: null, std_dev_3y: null, sharpe_3y: null, sortino_3y: null, max_drawdown_3y: null,
  sip_xirr_3y: null, sip_xirr_5y: null, expense_ratio: null, aum_cr: null,
} as const;
const fund = (patch: Partial<FundDetail> = {}): FundDetail =>
  ({ ...base, scheme_type: 'open_ended', isin_growth: null, isin_reinvest: null, peer_group: 'Financial services', is_active: true, metrics_as_of: null, factsheet: null, ...patch }) as FundDetail;
const peer = (code: number, patch: Partial<FundSummary> = {}): FundSummary => ({ ...base, scheme_code: code, ...patch }) as FundSummary;

const bankBook = [
  holding('ICICIBANK', 'Financial Services', 300),
  holding('PNB', 'Financial Services', 175),
  holding('INFY', 'Technology', 525),
];

describe('sectorsForTheme', () => {
  it('maps a sector theme to the sector names holdings carry', () => {
    expect(sectorsForTheme('Financial services')).toEqual(['Financial Services']);
    expect(sectorsForTheme('Healthcare')).toEqual(['Healthcare']);
    expect(sectorsForTheme('Consumption')).toEqual(['Consumer Defensive', 'Consumer Cyclical']);
  });

  it.each(['International', 'Quant and factor', 'Business cycle', 'Large Cap Fund', 'Other thematic', null])('claims no sector for %s', (group) => {
    expect(sectorsForTheme(group)).toEqual([]);
  });
});

describe('sectorExposure', () => {
  it('sums the weight of the named sectors and lists the holdings, biggest first', () => {
    expect(sectorExposure(bankBook, ['Financial Services'])).toEqual({ pct: 47.5, symbols: ['ICICIBANK', 'PNB'], unpriced: 0, unclassified: 0 });
  });

  it('is zero when nothing is held in those sectors', () => {
    expect(sectorExposure(bankBook, ['Healthcare'])).toEqual({ pct: 0, symbols: [], unpriced: 0, unclassified: 0 });
  });

  it('is null without a priced holding: no weight can be stated', () => {
    expect(sectorExposure([], ['Financial Services'])).toBeNull();
    expect(sectorExposure([holding('A', 'Financial Services', null)], ['Financial Services'])).toBeNull();
  });

  it('ignores holdings with no live price rather than counting them as zero value, and counts them', () => {
    const book = [holding('A', 'Financial Services', 100), holding('B', 'Technology', null)];
    expect(sectorExposure(book, ['Financial Services'])).toMatchObject({ pct: 100, unpriced: 1 });
  });

  it('matches sector names whatever their case, and counts holdings with no sector', () => {
    const book = [holding('A', 'financial services', 100), holding('B', null, 100)];
    expect(sectorExposure(book, ['Financial Services'])).toMatchObject({ pct: 50, symbols: ['A'], unclassified: 1 });
  });
});

describe('median', () => {
  it('takes the middle value, or the mean of the middle two', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
  });

  it('is null for an empty list', () => {
    expect(median([])).toBeNull();
  });
});

describe('buildXray: overlap', () => {
  it('names the sector weight and the holdings, and warns once it is large', () => {
    const facts = buildXray(fund(), [], bankBook);
    const overlap = facts.items.find((i) => i.key === 'overlap');
    expect(overlap?.tone).toBe('warning');
    expect(overlap?.text).toContain('47.5%');
    expect(overlap?.text).toContain('Financial Services');
    expect(overlap?.text).toContain('ICICIBANK');
    expect(facts.portfolioPct).toBe(47.5);
  });

  it('is plain information below the watch level', () => {
    const book = [holding('ICICIBANK', 'Financial Services', 100), holding('INFY', 'Technology', 900)];
    expect(buildXray(fund(), [], book).items.find((i) => i.key === 'overlap')?.tone).toBe('neutral');
  });

  it('says so when the fund is in a sector the portfolio does not hold, without calling that good or bad', () => {
    const facts = buildXray(fund({ peer_group: 'Healthcare' }), [], bankBook);
    const overlap = facts.items.find((i) => i.key === 'overlap');
    expect(overlap?.tone).toBe('neutral');
    expect(overlap?.text).toContain('None of your holdings');
  });

  it('states the weight as a fact and does not tell the reader what to do with it', () => {
    const text = buildXray(fund(), [], bankBook).items.find((i) => i.key === 'overlap')?.text ?? '';
    expect(text).not.toMatch(/would add|should|avoid|too much|reduce/i);
  });

  it('says how many holdings were left out of the weight', () => {
    const book = [...bankBook, holding('NOPRICE', 'Financial Services', null), holding('NOSECTOR', null, 50)];
    const text = buildXray(fund(), [], book).items.find((i) => i.key === 'overlap')?.text ?? '';
    expect(text).toContain('priced holdings');
    expect(text).toContain('1 without a live price');
    expect(text).toContain('1 without a sector');
  });

  it('tells a failed holdings read apart from having no holdings', () => {
    const failed = buildXray(fund(), [], null).items.find((i) => i.key === 'overlap');
    expect(failed?.text).toContain('could not be read');
    expect(failed?.text).not.toContain('Add your holdings');
    expect(buildXray(fund(), [], []).items.find((i) => i.key === 'overlap')?.text).toContain('Add your holdings');
  });

  it('tells holdings that are all unpriced apart from having none', () => {
    const text = buildXray(fund(), [], [holding('A', 'Financial Services', null)]).items.find((i) => i.key === 'overlap')?.text ?? '';
    expect(text).toContain('live price');
    expect(text).not.toContain('Add your holdings');
  });

  it('maps the housing theme to real estate', () => {
    expect(sectorsForTheme('Housing')).toEqual(['Real Estate']);
  });

  it('draws no sector link for a fund tied to no single sector', () => {
    const facts = buildXray(fund({ peer_group: 'International' }), [], bankBook);
    const overlap = facts.items.find((i) => i.key === 'overlap');
    expect(overlap?.tone).toBe('neutral');
    expect(overlap?.text).toContain('not tied to one sector');
    expect(facts.portfolioPct).toBeNull();
  });

  it('asks for holdings when there are none', () => {
    const overlap = buildXray(fund(), [], []).items.find((i) => i.key === 'overlap');
    expect(overlap?.text).toContain('Add your holdings');
  });

  it('never claims stock-level overlap, and always says it is unavailable', () => {
    for (const book of [bankBook, [], [holding('INFY', 'Technology', 10)]]) {
      for (const group of ['Financial services', 'International', null]) {
        const text = buildXray(fund({ peer_group: group }), [], book).items.find((i) => i.key === 'overlap')?.text ?? '';
        expect(text).toContain(STOCK_OVERLAP_NOTE);
        expect(text).not.toMatch(/\b\d+% overlap\b/i);
      }
    }
  });
});

describe('buildXray: cost and downside', () => {
  const peers = [
    peer(2, { expense_ratio: 0.8, max_drawdown_3y: -20 }),
    peer(3, { expense_ratio: 1.0, max_drawdown_3y: -25 }),
    peer(4, { expense_ratio: 1.2, max_drawdown_3y: -30 }),
  ];

  it('compares expense ratio and worst fall with the peer medians', () => {
    const cost = buildXray(fund({ expense_ratio: 1.5, max_drawdown_3y: -40 }), peers, []).items.find((i) => i.key === 'cost');
    expect(cost?.text).toContain('1.50%');
    expect(cost?.text).toContain('peer median of 1.00%');
    expect(cost?.text).toContain('40.0%');
    expect(cost?.text).toContain('25.0%');
    expect(cost?.tone).toBe('warning');
  });

  it('is positive only when the fund is clearly cheaper than its peers, not for a hair', () => {
    expect(buildXray(fund({ expense_ratio: 0.5 }), peers, []).items.find((i) => i.key === 'cost')?.tone).toBe('positive');
    expect(buildXray(fund({ expense_ratio: 0.99 }), peers, []).items.find((i) => i.key === 'cost')?.tone).toBe('neutral');
  });

  it('states the figures without a comparison when there are too few peers', () => {
    const cost = buildXray(fund({ expense_ratio: 1.5 }), [peers[0] as FundSummary], []).items.find((i) => i.key === 'cost');
    expect(cost?.text).toContain('1.50%');
    expect(cost?.text).toContain('too few peers');
    expect(cost?.text).not.toContain('median');
  });

  it('says plainly when nothing is stored', () => {
    expect(buildXray(fund(), peers, []).items.find((i) => i.key === 'cost')?.text).toContain('not stored');
  });
});

describe('buildXray: role', () => {
  it('describes the fund and its volatility against peers, with no verdict label', () => {
    const peers = [peer(2, { std_dev_3y: 20 }), peer(3, { std_dev_3y: 24 }), peer(4, { std_dev_3y: 28 })];
    const role = buildXray(fund({ std_dev_3y: 37.3 }), peers, []).items.find((i) => i.key === 'role');
    expect(role?.text).toContain('Financial services');
    expect(role?.text).toContain('37.3%');
    expect(role?.text).toContain('24.0%');
    expect(role?.tone).toBe('warning');
    expect(role?.text).not.toMatch(/compounder|satellite|buy|sell|avoid/i);
  });

  it('copes with no risk figures', () => {
    expect(buildXray(fund(), [], []).items.find((i) => i.key === 'role')?.text).toContain('not stored');
  });
});

describe('buildXray: shape', () => {
  it('always returns the three items in order', () => {
    expect(buildXray(fund(), [], []).items.map((i) => i.key)).toEqual(['role', 'overlap', 'cost']);
  });

  it('does not change what it is given', () => {
    const f = fund({ expense_ratio: 1 });
    const p = [peer(2)];
    const h = [...bankBook];
    const before = JSON.stringify([f, p, h]);
    buildXray(f, p, h);
    expect(JSON.stringify([f, p, h])).toBe(before);
  });
});

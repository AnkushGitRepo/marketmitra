import { describe, expect, it } from 'vitest';
import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import { buildXray, median, sectorExposure, sectorsForTheme, XRAY_SCOPE_NOTE } from './xray';
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

  it('describes an international fund by what it is: overseas and rupee exposure against Indian holdings', () => {
    const facts = buildXray(fund({ peer_group: 'International', sub_category: 'Thematic Fund' }), [], bankBook);
    const overlap = facts.items.find((i) => i.key === 'overlap');
    expect(overlap?.tone).toBe('neutral');
    expect(overlap?.text).toContain('overseas');
    expect(overlap?.text).toContain('rupee');
    expect(facts.portfolioPct).toBeNull();
  });

  it('says a diversified fund holds across sectors, in plain words', () => {
    const overlap = buildXray(fund({ peer_group: 'Flexi Cap Fund' }), [], bankBook).items.find((i) => i.key === 'overlap');
    expect(overlap?.text).toContain('across sectors');
    expect(overlap?.text).toContain('Flexi Cap fund');
  });

  it('never reads "Fund fund" or "funds funds" when a SEBI category name is used as the fund type', () => {
    for (const group of ['Thematic Fund', 'Flexi Cap Fund', 'Other thematic', 'Financial services']) {
      for (const item of buildXray(fund({ peer_group: group }), [peer(2)], bankBook).items) {
        expect(item.text).not.toMatch(/\bfunds? funds?\b/i);
      }
    }
  });

  it('asks for holdings when there are none', () => {
    const overlap = buildXray(fund(), [], []).items.find((i) => i.key === 'overlap');
    expect(overlap?.text).toContain('Add your holdings');
  });

  it('never claims stock-level overlap, and never makes an excuse about missing data inside a finding', () => {
    for (const book of [bankBook, [], [holding('INFY', 'Technology', 10)]]) {
      for (const group of ['Financial services', 'International', 'Flexi Cap Fund', null]) {
        for (const item of buildXray(fund({ peer_group: group }), [], book).items) {
          expect(item.text).not.toMatch(/\b\d+% overlap\b/i);
          expect(item.text).not.toMatch(/isn['’]t available|not available|unavailable|not loaded/i);
        }
      }
    }
  });

  it('keeps the scope limit in one place, for the card footer, and says what it is', () => {
    expect(XRAY_SCOPE_NOTE).toMatch(/sector level/i);
    expect(XRAY_SCOPE_NOTE).toMatch(/holdings are not loaded/i);
  });
});

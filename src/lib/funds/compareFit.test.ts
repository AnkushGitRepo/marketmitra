import { describe, expect, it } from 'vitest';
import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import { fitCell, portfolioFits } from './compareFit';
import type { FundSummary } from './types';

const holding = (symbol: string, sector: string | null, value: number | null): HoldingLike => ({
  symbol, name: symbol, quantity: 1, avgPrice: 1, ltp: value, sector, dayChange: null,
});
const fund = (scheme_code: number, peer_group: string | null, category = 'Equity'): FundSummary & { peer_group: string | null } =>
  ({ scheme_code, name: `F${scheme_code}`, base_name: `Fund ${scheme_code}`, sub_category: 'Thematic Fund', category, peer_group }) as FundSummary & { peer_group: string | null };

const book = [holding('A', 'Healthcare', 250), holding('B', 'Financial Services', 750)];

describe('portfolioFits', () => {
  it('gives each fund its sector weight, or what it is when it has no single sector', () => {
    const fits = portfolioFits([fund(1, 'Healthcare'), fund(2, 'Defence'), fund(3, 'International'), fund(4, 'Flexi Cap Fund')], book);
    expect(fits?.map((f) => [f.code, f.kind, f.pct])).toEqual([
      [1, 'sector', 25],
      [2, 'sector', 0],
      [3, 'overseas', null],
      [4, 'broad', null],
    ]);
    expect(fits?.[0]?.sectors).toEqual(['Healthcare']);
  });

  it('does not call a debt, gold or hybrid fund diversified equity: it has no sector view', () => {
    const fits = portfolioFits([fund(5, 'Liquid Fund', 'Debt'), fund(6, null, 'Other'), fund(7, 'Flexi Cap Fund')], book);
    expect(fits?.map((f) => f.kind)).toEqual(['other', 'other', 'broad']);
  });

  it('is null when no weight can be stated: no holdings, a failed read, or nothing priced', () => {
    expect(portfolioFits([fund(1, 'Healthcare')], [])).toBeNull();
    expect(portfolioFits([fund(1, 'Healthcare')], null)).toBeNull();
    expect(portfolioFits([fund(1, 'Healthcare')], [holding('A', 'Healthcare', null)])).toBeNull();
  });

  it('does not change what it is given', () => {
    const funds = [fund(1, 'Healthcare')];
    const before = JSON.stringify([funds, book]);
    portfolioFits(funds, book);
    expect(JSON.stringify([funds, book])).toBe(before);
  });
});

describe('fitCell', () => {
  it('says the weight as a fact, with the sector, and never a verdict', () => {
    expect(fitCell({ code: 1, kind: 'sector', sectors: ['Healthcare'], pct: 26.7 })).toEqual({ text: '26.7%', detail: 'in Healthcare' });
    expect(fitCell({ code: 2, kind: 'sector', sectors: ['Industrials', 'Utilities'], pct: 0 })).toEqual({ text: 'None held', detail: 'in Industrials and Utilities' });
  });

  it('says plainly that a fund type with no sector view has none', () => {
    expect(fitCell({ code: 5, kind: 'other', sectors: [], pct: null })).toEqual({ text: 'No sector view', detail: 'for this fund type' });
  });

  it('describes the rest by what they are', () => {
    expect(fitCell({ code: 3, kind: 'overseas', sectors: [], pct: null })).toEqual({ text: 'Overseas', detail: 'not Indian stocks' });
    expect(fitCell({ code: 4, kind: 'broad', sectors: [], pct: null })).toEqual({ text: 'Spans sectors', detail: '' });
  });

  it('never reads like advice', () => {
    for (const fit of [
      { code: 1, kind: 'sector', sectors: ['Healthcare'], pct: 60 },
      { code: 2, kind: 'sector', sectors: ['Healthcare'], pct: 0 },
    ] as const) {
      const { text, detail } = fitCell(fit);
      expect(`${text} ${detail}`).not.toMatch(/overlap|high|low|avoid|should|good|bad|diversif/i);
    }
  });
});

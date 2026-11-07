import { describe, expect, it } from 'vitest';
import { DEFAULT_SCREEN_CONFIG as cfg } from './config';
import { healthy, year } from './fixtures';
import { deriveRoce, median, runScreen } from './rules';
import type { ScreenData } from './types';

const statusOf = (d: ScreenData, id: string) => runScreen(d, cfg).gates.find((g) => g.id === id)!;

describe('runScreen', () => {
  it('passes a healthy company when pledge data is supplied', () => {
    const r = runScreen(healthy(), cfg);
    expect(r.gates.filter((g) => g.status !== 'pass')).toEqual([]);
    expect(r.eligible).toBe(true);
    expect(r.score).toBe(100);
  });

  it('is deterministic', () => {
    expect(runScreen(healthy(), cfg)).toEqual(runScreen(healthy(), cfg));
  });

  it('blocks eligibility when pledge is unknown — never a silent pass', () => {
    const r = runScreen(healthy({ promoterPledgePct: null }), cfg);
    expect(r.gates.find((g) => g.id === 'pledge')!.status).toBe('unknown');
    expect(r.eligible).toBe(false);
  });

  it('fails a pledge above the ceiling', () => {
    expect(statusOf(healthy({ promoterPledgePct: 12 }), 'pledge').status).toBe('fail');
  });

  it('fails low ROCE and reports the values', () => {
    const d = healthy({ annual: [0, 1, 2, 3, 4, 5].map((b) => year(b, { profitBeforeTax: 50 })) });
    const g = statusOf(d, 'roce');
    expect(g.status).toBe('fail');
    expect(g.actual).toMatch(/avg/);
  });

  it('marks ROCE unknown when inputs are missing', () => {
    const d = healthy({ annual: [0, 1, 2, 3, 4, 5].map((b) => year(b, b === 2 ? { interest: null } : {})) });
    expect(statusOf(d, 'roce').status).toBe('unknown');
  });

  it('fails high debt/equity and negative equity', () => {
    const high = healthy({ annual: [year(0, { borrowings: 900 }), ...[1, 2, 3, 4, 5].map((b) => year(b))] });
    expect(statusOf(high, 'debt_equity').status).toBe('fail');
    const neg = healthy({ annual: [year(0, { reserves: -500 }), ...[1, 2, 3, 4, 5].map((b) => year(b))] });
    expect(statusOf(neg, 'debt_equity').actual).toBe('negative equity');
  });

  it('exempts financial-sector debt/equity and flags it', () => {
    const r = runScreen(healthy({ sector: 'Financial Services' }), cfg);
    expect(r.gates.find((g) => g.id === 'debt_equity')!.status).toBe('not_applicable');
    expect(r.flags.join(' ')).toMatch(/Debt\/equity was skipped/);
    expect(r.eligible).toBe(true);
  });

  it('honours a per-sector D/E override', () => {
    const d = healthy({
      sector: 'Utilities',
      annual: [year(0, { borrowings: 900 }), ...[1, 2, 3, 4, 5].map((b) => year(b))],
    });
    const lenient = { ...cfg, debtToEquityBySector: { Utilities: 2 } };
    expect(runScreen(d, lenient).gates.find((g) => g.id === 'debt_equity')!.status).toBe('pass');
  });

  it('allows one negative-FCF year but not two', () => {
    const one = healthy({ annual: [0, 1, 2, 3, 4, 5].map((b) => year(b, b === 1 ? { freeCashFlow: -5 } : {})) });
    expect(statusOf(one, 'fcf').status).toBe('pass');
    const two = healthy({ annual: [0, 1, 2, 3, 4, 5].map((b) => year(b, b <= 1 ? { freeCashFlow: -5 } : {})) });
    expect(statusOf(two, 'fcf').status).toBe('fail');
  });

  it('fails when revenue falls in more than one year', () => {
    // newest first: 900 < 1100 (down), 800 < 1200 (down), 1200 < 1300 (down)
    const sales = [900, 1100, 1000, 800, 1200, 1300];
    const d = healthy({ annual: sales.map((s, b) => year(b, { sales: s })) });
    const g = statusOf(d, 'growth_consistency');
    expect(g.status).toBe('fail');
    expect(g.actual).toContain('revenue down 3');
  });

  it('tolerates a single down year', () => {
    const sales = [900, 1100, 1000, 950, 900, 800];
    const d = healthy({ annual: sales.map((s, b) => year(b, { sales: s })) });
    expect(statusOf(d, 'growth_consistency').status).toBe('pass');
  });

  it('fails a sustained promoter decline but not a one-quarter dip', () => {
    const sliding = healthy({
      promoter: [58, 59, 60, 61, 62].map((pct, i) => ({ quarterEnd: `2026-0${9 - i * 3 > 0 ? 9 - i * 3 : 1}-30`, pct })),
    });
    expect(statusOf(sliding, 'promoter_trend').status).toBe('fail');
    const dip = healthy({
      promoter: [59.5, 60, 60, 60, 60].map((pct, i) => ({ quarterEnd: `q${i}`, pct })),
    });
    expect(statusOf(dip, 'promoter_trend').status).toBe('pass');
  });

  it('marks promoter trend unknown with too little history', () => {
    expect(statusOf(healthy({ promoter: [{ quarterEnd: 'x', pct: 60 }] }), 'promoter_trend').status).toBe('unknown');
  });

  it('fails an expensive P/E versus own history and passes a cheap one', () => {
    // healthy historic P/E is 15 every year
    expect(statusOf(healthy({ currentPe: 30 }), 'valuation').status).toBe('fail');
    expect(statusOf(healthy({ currentPe: 12 }), 'valuation').status).toBe('pass');
  });

  it('marks valuation unknown without enough P/E points or with negative P/E', () => {
    const sparse = healthy({ annual: [0, 1, 2, 3, 4, 5].map((b) => year(b, { priceAtYearEnd: null })) });
    expect(statusOf(sparse, 'valuation').status).toBe('unknown');
    expect(statusOf(healthy({ currentPe: -3 }), 'valuation').status).toBe('unknown');
  });

  it('rejects stale data', () => {
    const r = runScreen(healthy({ asOf: '2028-06-01' }), cfg);
    expect(r.gates.find((g) => g.id === 'data_fresh')!.status).toBe('fail');
    expect(r.eligible).toBe(false);
  });

  it('rejects a missing fiscal year', () => {
    const years = [0, 1, 3, 4, 5].map((b) => year(b));
    const r = runScreen(healthy({ annual: years }), cfg);
    expect(r.gates.find((g) => g.id === 'data_complete')!.status).toBe('fail');
  });

  it('flags — but does not block on — sources that disagree', () => {
    const r = runScreen(healthy({ reportedRocePct: 60 }), cfg);
    expect(r.flags.join(' ')).toMatch(/sources may disagree/);
    expect(r.eligible).toBe(true);
  });

  it('takes thresholds from config', () => {
    const strict = { ...cfg, minAvgRocePct: 95 };
    expect(runScreen(healthy(), strict).gates.find((g) => g.id === 'roce')!.status).toBe('fail');
  });
});

describe('helpers', () => {
  it('median handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
  it('deriveRoce uses (PBT+interest)/(equity+reserves+borrowings)', () => {
    expect(deriveRoce(year(0, { profitBeforeTax: 100, interest: 20, equityCapital: 100, reserves: 400, borrowings: 100 }))).toBeCloseTo(20);
    expect(deriveRoce(year(0, { interest: null }))).toBeNull();
  });
});

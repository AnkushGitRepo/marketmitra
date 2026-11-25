import { describe, expect, it } from 'vitest';
import type { AnnouncementOut } from '@/lib/dashboard/fundamentalsApi';
import { riskBlocks, riskRating, riskRegisterSchema, riskScore, type RiskItem } from './riskBlocks';
import { riskSeeds } from './riskSeeds';
import type { YearFigures } from './statements';

const risk = (over: Partial<RiskItem>): RiskItem => ({ category: 'Financial', risk: 'Refinancing of a large bond', probability: 'Medium', severity: 'Medium', watch: 'Spreads on new debt', ...over });

describe('risk register', () => {
  it('scores probability times severity and rates it', () => {
    expect(riskScore(risk({ probability: 'High', severity: 'High' }))).toBe(9);
    expect([riskScore(risk({ probability: 'Low', severity: 'Low' })), riskRating(1), riskRating(3), riskRating(6), riskRating(9)]).toEqual([1, 'Low', 'Medium', 'High', 'High']);
  });
  it('lists the highest-rated first and keeps the model’s order between equals', () => {
    const [table] = riskBlocks([risk({ risk: 'A low one here', probability: 'Low', severity: 'Low' }), risk({ risk: 'B first medium', }), risk({ risk: 'C second medium' }), risk({ risk: 'D top risk now', probability: 'High', severity: 'High' })]);
    if (table.type !== 'data_table') throw new Error();
    expect(table.rows.map((r) => r.risk)).toEqual(['D top risk now', 'B first medium', 'C second medium', 'A low one here']);
    expect(table.rows[0]).toMatchObject({ rating: 'High' });
  });
  it('is empty with no risks', () => {
    expect(riskBlocks([])).toEqual([]);
  });
  it('validates what the model returns: known categories and levels only, at least one risk', () => {
    expect(riskRegisterSchema.safeParse({ risks: [risk({})] }).success).toBe(true);
    expect(riskRegisterSchema.safeParse({ risks: [] }).success).toBe(false);
    expect(riskRegisterSchema.safeParse({ risks: [{ ...risk({}), category: 'Weather' }] }).success).toBe(false);
    expect(riskRegisterSchema.safeParse({ risks: [{ ...risk({}), severity: 'Extreme' }] }).success).toBe(false);
  });
});

const year = (label: string, over: Partial<YearFigures> = {}): YearFigures => ({
  periodEnd: `20${label.slice(2)}-03-31`, label, sales: 1000, operatingProfit: 300, netProfit: 100, interest: 30, eps: 5, borrowings: 400, totalDebt: 450, cash: 150, equity: 800, totalAssets: 2000, cfo: 250, fcf: 80, cfoToEbitda: 83, ...over,
});
const lit = (announced_on: string): AnnouncementOut => ({ title: 'Court order', category: 'litigation', announced_on, summary: null, url: 'https://x.test', source_tier: 't' });

describe('riskSeeds', () => {
  const none = { pledge: null, fiiChange: null, announcements: null };

  it('says nothing for a healthy company', () => {
    expect(riskSeeds({ ...none, years: [year('FY25'), year('FY26')] })).toEqual([]);
  });

  it('flags high leverage, thin interest cover and net debt against operating profit', () => {
    const seeds = riskSeeds({ ...none, years: [year('FY26', { borrowings: 1200, equity: 800, interest: 150, totalDebt: 1200, cash: 100 })] });
    expect(seeds).toContain('Debt to equity is 1.50x in FY26, above 1x.');
    expect(seeds).toContain('Interest cover is 2.0x in FY26, below 3x.');
    expect(seeds.some((s) => s.startsWith('Net debt is 3.7 times FY26 operating profit'))).toBe(true);
  });

  it('flags weak cash conversion and years of negative free cash flow', () => {
    const seeds = riskSeeds({ ...none, years: [year('FY24', { cfo: 40, fcf: -20 }), year('FY25', { cfo: 40, fcf: -5 }), year('FY26', { cfo: 40, fcf: 30 })] });
    expect(seeds.some((s) => s.startsWith('Operating cash flow was 40% of net profit over the 3 years'))).toBe(true);
    expect(seeds).toContain('Free cash flow was negative in 2 of the 3 years on record (FY24, FY25).');
  });

  it('flags a pledge, foreign selling and litigation notices, and ignores small moves', () => {
    const seeds = riskSeeds({ years: [year('FY26')], pledge: 73, fiiChange: -1.4, announcements: [lit('2026-09-05'), lit('2026-08-01')] });
    expect(seeds).toContain('Promoters have pledged 73.0% of their holding (as flagged by Screener).');
    expect(seeds).toContain('Foreign institutional holding fell 1.40 points in the latest quarter.');
    expect(seeds).toContain('2 litigation or penalty notices in the stored exchange announcements (latest 2026-09-05).');
    expect(riskSeeds({ years: [year('FY26')], pledge: null, fiiChange: -0.3, announcements: [] })).toEqual([]);
  });

  it('copes with no statements at all', () => {
    expect(riskSeeds({ ...none, years: [] })).toEqual([]);
  });
});

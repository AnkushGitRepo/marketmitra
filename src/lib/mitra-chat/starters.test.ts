import { describe, expect, it } from 'vitest';
import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import { buildStarterPrompts, FALLBACK_STARTERS, greetingFor, portfolioStatus } from './starters';

const h = (symbol: string, quantity: number, avgPrice: number, ltp: number | null, sector: string | null, name = symbol): HoldingLike => ({
  symbol, name, quantity, avgPrice, ltp, sector, dayChange: 0,
});

const portfolio: HoldingLike[] = [
  h('AAA', 10, 100, 400, 'Financial Services', 'Alpha Bank'), // value 4000, +300%
  h('BBB', 10, 100, 200, 'Financial Services', 'Beta Finance'), // value 2000, +100%
  h('CCC', 10, 100, 50, 'Healthcare', 'Gamma Pharma'), // value 500, -50%
  h('DDD', 10, 100, 100, 'Healthcare', 'Delta Labs'), // value 1000, flat
];

describe('greetingFor', () => {
  it.each([
    ['2026-11-11T00:30:00Z', 'Good morning'], // 06:00 IST
    ['2026-11-11T05:00:00Z', 'Good morning'], // 10:30 IST
    ['2026-11-11T07:30:00Z', 'Good afternoon'], // 13:00 IST
    ['2026-11-11T12:30:00Z', 'Good evening'], // 18:00 IST
    ['2026-11-11T17:00:00Z', 'Good evening'], // 22:30 IST
    ['2026-11-11T21:30:00Z', 'Good evening'], // 03:00 IST, still the small hours of the night
  ])('%s -> %s', (iso, word) => {
    expect(greetingFor(new Date(iso))).toBe(word);
  });

  it('adds the first name when known and ignores blanks', () => {
    const now = new Date('2026-11-11T05:00:00Z');
    expect(greetingFor(now, 'Ankush')).toBe('Good morning, Ankush');
    expect(greetingFor(now, '  ')).toBe('Good morning');
    expect(greetingFor(now, null)).toBe('Good morning');
  });
});

describe('portfolioStatus', () => {
  const fmt = (n: number) => `₹${Math.abs(n)}`;
  it('states value and today change with a sign', () => {
    expect(portfolioStatus({ totalValue: 52072, todayChange: 773 }, fmt)).toBe('Your portfolio is at ₹52072 (+₹773 today).');
    expect(portfolioStatus({ totalValue: 52072, todayChange: -400 }, fmt)).toBe('Your portfolio is at ₹52072 (-₹400 today).');
    expect(portfolioStatus({ totalValue: 52072, todayChange: 0 }, fmt)).toBe('Your portfolio is at ₹52072 (flat today).');
  });
  it('is null when there is nothing priced', () => {
    expect(portfolioStatus({ totalValue: 0, todayChange: 0 }, fmt)).toBeNull();
  });
});

describe('buildStarterPrompts', () => {
  it('builds four cards from the real holdings, ending with the document card', () => {
    const cards = buildStarterPrompts(portfolio);
    expect(cards.map((c) => c.id)).toEqual(['concentration', 'sector', 'winner', 'document']);
    expect(cards[0].prompt).toContain('93.3%'); // (4000+2000+1000)/7500
    expect(cards[0].prompt).toContain('Alpha Bank');
    expect(cards[1].prompt).toContain('80.0%'); // 6000/7500
    expect(cards[1].prompt).toContain('Financial Services');
    expect(cards[2].prompt).toContain('Alpha Bank');
    expect(cards[2].prompt).toContain('+300.0%');
    expect(cards[3].action).toBe('attach');
    expect(cards.slice(0, 3).every((c) => c.action === 'send')).toBe(true);
  });

  it('swaps the winner for a drawdown review when nothing is in profit', () => {
    const cards = buildStarterPrompts([h('A', 10, 100, 50, 'Tech', 'Alpha'), h('B', 10, 100, 80, 'Tech', 'Beta'), h('C', 10, 100, 90, 'Tech', 'Gamma')]);
    expect(cards[2].id).toBe('drawdown');
    expect(cards[2].prompt).toContain('Alpha');
    expect(cards[2].prompt).toContain('-50.0%');
  });

  it('never asks Mitra to say whether to buy, sell or cut losses', () => {
    for (const c of buildStarterPrompts(portfolio)) expect(c.prompt).not.toMatch(/\b(should i (buy|sell|cut|hold)|cut (my )?losses|sell it)\b/i);
    const dd = buildStarterPrompts([h('A', 10, 100, 50, 'Tech', 'Alpha'), h('B', 10, 100, 80, 'Tech'), h('C', 10, 100, 90, 'Tech')]);
    for (const c of dd) expect(c.prompt).not.toMatch(/\b(should i (buy|sell|cut|hold)|cut (my )?losses)\b/i);
  });

  it('asks about diversification instead of top-3 concentration when there are fewer than three priced holdings', () => {
    const cards = buildStarterPrompts([h('A', 10, 100, 120, 'Tech', 'Alpha'), h('B', 10, 100, 110, 'Pharma', 'Beta')]);
    expect(cards[0].id).toBe('concentration');
    expect(cards[0].prompt).toMatch(/only 2 stocks/i);
  });

  it('falls back to generic starters, still ending with the document card, when there is nothing priced', () => {
    for (const holdings of [[], [h('A', 1, 1, null, null)]]) {
      const cards = buildStarterPrompts(holdings);
      expect(cards).toEqual(FALLBACK_STARTERS);
      expect(cards.at(-1)?.action).toBe('attach');
      expect(cards).toHaveLength(4);
    }
  });

  it('does not mutate the holdings', () => {
    const before = JSON.stringify(portfolio);
    buildStarterPrompts(portfolio);
    expect(JSON.stringify(portfolio)).toBe(before);
  });
});

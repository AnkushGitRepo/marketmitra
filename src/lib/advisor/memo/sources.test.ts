import { describe, expect, it } from 'vitest';
import { runScreen } from '../screen/rules';
import { DEFAULT_SCREEN_CONFIG } from '../screen/config';
import { healthy } from '../screen/fixtures';
import { buildFacts, buildPassages } from './sources';

const prose = (topic: string) =>
  `${topic} `.repeat(1) +
  'The company competes on brand, customers and long relationships, and management discusses risk and strategy in detail across its business overview and outlook. '.repeat(8);

describe('buildPassages', () => {
  it('keeps prose with section hints, drops table-like junk, and respects the budget', () => {
    const junk = '1 2 3 4 5 6 7 8 9 | 10 11 12 13 14 15 | 16 17 18 19 20 | '.repeat(80);
    const text = [prose('A.'), junk, prose('B.'), prose('C.')].join('\n\n');
    const ps = buildPassages(text, { idPrefix: 'AR1', label: 'Annual report', budgetChars: 4000 });
    expect(ps.length).toBeGreaterThan(0);
    expect(ps.reduce((a, p) => a + p.text.length, 0)).toBeLessThanOrEqual(4000);
    expect(ps.every((p) => p.id.startsWith('AR1-'))).toBe(true);
    expect(ps.some((p) => p.text.startsWith('1 2 3'))).toBe(false);
  });
  it('is deterministic and returns passages in document order', () => {
    const text = [prose('A.'), prose('B.'), prose('C.')].join('\n\n');
    const a = buildPassages(text, { idPrefix: 'P', label: 'x' });
    expect(a).toEqual(buildPassages(text, { idPrefix: 'P', label: 'x' }));
    expect(a.map((p) => p.id)).toEqual([...a.map((p) => p.id)].sort());
  });
});

describe('buildFacts', () => {
  it('exposes only measured gates, not unknowns', () => {
    const facts = buildFacts(runScreen(healthy({ promoterPledgePct: null }), DEFAULT_SCREEN_CONFIG));
    expect(facts.some((f) => /pledge/i.test(f.text))).toBe(false);
    expect(facts.find((f) => /ROCE/.test(f.text))?.id).toMatch(/^F\d+$/);
  });
});

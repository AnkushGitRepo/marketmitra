import { describe, expect, it } from 'vitest';
import { scanForTradeActions } from './tradeActionCheck';

describe('scanForTradeActions', () => {
  it('passes a permitted "where the evidence leans" paragraph', () => {
    const ok = `The bear case is currently better evidenced on the margin trend, where
      three straight quarters of contraction are visible in the statements. The bull case
      rests on a capex cycle that has not yet shown up in results. A ratio like the P/E
      sits above the peer median, which the panel notes as a fact.`;
    expect(scanForTradeActions(ok).ok).toBe(true);
  });

  it.each([
    'On balance we would recommend investors to buy the stock here.',
    'This looks like a buy at current levels.',
    'Our price target is ₹1,450.',
    'The shares are clearly overvalued and should be avoided.',
    'There is a 70% probability that the stock will rally from here.',
    'We rate the stock a Hold.',
    'It may be time to book profits.',
  ])('flags trade-action phrasing: %s', (line) => {
    const scan = scanForTradeActions(line);
    expect(scan.ok).toBe(false);
    expect(scan.hits.length).toBeGreaterThan(0);
  });

  it('does not flag a factual valuation comparison', () => {
    expect(
      scanForTradeActions('Its EV/EBITDA of 14x is below the sector average of 19x.').ok
    ).toBe(true);
  });
});

describe('known gaps in the patterns, covered by the decision model (#206)', () => {
  // Trade advice in wording the fixed patterns do not recognise. The Gemini decision model is asked as well.
  // If a pattern is ever widened to catch one, move it into a test above.
  it.each([
    'It would be wise to pick up more shares of Laurus on weakness.',
    'Investors may want to take some money off the table here.',
    'This one looks like a screaming bargain at current levels.',
    'Consider lightening the position before results.',
  ])('passes the scan: %s', (text) => {
    expect(scanForTradeActions(text).ok).toBe(true);
  });
});


import { describe, expect, it } from 'vitest';
import { ROOT_STARTERS, analystStarters } from './chatPrompts';

describe('chat starters', () => {
  it('names the stock, and offers a valuation question only in unrestricted mode', () => {
    expect(analystStarters('ACC').every((s) => s.includes('ACC'))).toBe(true);
    expect(analystStarters('ACC').join(' ')).not.toMatch(/undervalued/i);
    expect(analystStarters('ACC', 'unrestricted').join(' ')).toMatch(/undervalued/i);
  });
  it('gives the Root Agent portfolio-wide starters', () => {
    expect(ROOT_STARTERS.length).toBeGreaterThan(0);
  });
});

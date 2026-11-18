import { describe, expect, it } from 'vitest';
import { formatAum, formatNav, formatNumber, formatPercent, returnTone, DASH } from './format';

describe('fund formatting', () => {
  it('shows a dash for missing values, never 0', () => {
    expect(formatPercent(null)).toBe(DASH);
    expect(formatNumber(null)).toBe(DASH);
    expect(formatAum(null)).toBe(DASH);
    expect(formatNav(null)).toBe(DASH);
  });

  it('signs and rounds percentages', () => {
    expect(formatPercent(12.3456)).toBe('+12.35%');
    expect(formatPercent(-3.2)).toBe('-3.20%');
    expect(formatPercent(0)).toBe('0.00%');
    expect(formatPercent(12.3456, { signed: false })).toBe('12.35%');
  });

  it('formats NAV, ratios and AUM in Indian style', () => {
    expect(formatNav(1234.5678)).toBe('₹1,234.5678');
    expect(formatNumber(1.2345)).toBe('1.23');
    expect(formatAum(123456.7)).toBe('₹1,23,457 Cr');
  });

  it('tones returns by sign', () => {
    expect(returnTone(5)).toBe('up');
    expect(returnTone(-0.01)).toBe('down');
    expect(returnTone(0)).toBe('flat');
    expect(returnTone(null)).toBe('flat');
  });
});

describe('rounding and sign', () => {
  it('never shows negative zero', () => {
    expect(formatNumber(-0.001)).toBe('0.00');
    expect(formatNumber(-0.004, 2)).toBe('0.00');
    expect(formatPercent(-0.001)).toBe('0.00%');
  });

  it('tones by the value as displayed, so a "0.00%" is never red or green', () => {
    expect(returnTone(-0.004)).toBe('flat');
    expect(returnTone(0.004)).toBe('flat');
    expect(returnTone(0.006)).toBe('up');
    expect(returnTone(-0.006)).toBe('down');
  });
});

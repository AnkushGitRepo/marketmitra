import { describe, expect, it } from 'vitest';
import { formatCell, formatCrore, formatRupeesShort, median, periodLabel, toNumber } from './formatters';

describe('formatCrore', () => {
  it('switches to lakh crore from 1,00,000', () => {
    expect(formatCrore(99_999)).toBe('₹99,999 Cr');
    expect(formatCrore(1_855_310)).toBe('₹18.55L Cr');
  });
  it('shows a dash for a missing figure', () => {
    expect(formatCrore(null)).toBe('—');
  });
});

describe('negative crore and multiples', () => {
  it('puts the minus sign before the rupee sign', () => {
    expect(formatCrore(-685)).toBe('−₹685 Cr');
    expect(formatCrore(-250_000)).toBe('−₹2.50L Cr');
  });
  it('formats a multiple with two decimals', () => {
    expect(formatCell(0.254, 'multiple')).toBe('0.25x');
    expect(formatCell(null, 'multiple')).toBe('—');
  });
});

describe('formatCell', () => {
  it('formats by column format and leaves text alone', () => {
    expect(formatCell(12.34, 'percent')).toBe('12.3%');
    expect(formatCell('Reliance', 'text')).toBe('Reliance');
    expect(formatCell(null, 'number')).toBe('—');
  });
});

describe('toNumber', () => {
  it('parses data-service strings and rejects the rest', () => {
    expect(toNumber('1371.0000')).toBe(1371);
    expect(toNumber('')).toBeNull();
    expect(toNumber('n/a')).toBeNull();
    expect(toNumber(null)).toBeNull();
  });
});

describe('periodLabel and median', () => {
  it('labels a period end', () => {
    expect(periodLabel('2026-03-31')).toBe('Mar 26');
  });
  it('takes the median of odd and even lists', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('formatRupeesShort', () => {
  it('uses lakh and crore and keeps the sign', () => {
    expect(formatRupeesShort(950)).toBe('₹950');
    expect(formatRupeesShort(250_000)).toBe('₹2.50 L');
    expect(formatRupeesShort(-32_000_000)).toBe('−₹3.20 Cr');
  });
});

import { describe, expect, it } from 'vitest';
import { delatex } from './delatex';

describe('delatex', () => {
  it('turns the debt-to-equity formula from the bug report into plain text', () => {
    expect(delatex('Looking at Net D/E ($[\\text{Debt} - \\text{Cash}] / \\text{Equity}$) gives a clearer picture.')).toBe('Looking at Net D/E ([Debt - Cash] / Equity) gives a clearer picture.');
    expect(delatex('Coverage ($\\text{EBIT} / \\text{Interest Expense}$) tells you more.')).toBe('Coverage (EBIT / Interest Expense) tells you more.');
  });

  it('handles fractions, symbols, powers and the other math delimiters', () => {
    expect(delatex('$\\frac{\\text{Price}}{\\text{Earnings}}$')).toBe('Price / Earnings');
    expect(delatex('$\\frac{a + b}{c}$')).toBe('(a + b) / c');
    expect(delatex('\\(ROE = \\frac{NI}{Equity} \\times 100\\%\\)')).toBe('ROE = NI / Equity × 100%');
    expect(delatex('$$x^2 \\leq y$$')).toBe('x² ≤ y');
    expect(delatex('\\[\\sqrt{2}\\]')).toBe('√(2)');
  });

  it('leaves dollar amounts and ordinary text exactly as written', () => {
    expect(delatex('It costs $5 and then $10 more.')).toBe('It costs $5 and then $10 more.');
    expect(delatex('No math here.')).toBe('No math here.');
    expect(delatex('Paid ₹1,000 Cr of debt.')).toBe('Paid ₹1,000 Cr of debt.');
  });

  it('converts each formula in a line separately', () => {
    expect(delatex('$\\text{A} / \\text{B}$ and then $\\text{C} \\times 2$')).toBe('A / B and then C × 2');
  });
});

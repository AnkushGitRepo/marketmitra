import { describe, expect, it } from 'vitest';
import { numberedItems, stripMath } from './plainText';

describe('stripMath', () => {
  it('removes the dollar delimiters around a LaTeX term', () => {
    expect(stripMath('The $P/E$ and $P/B$ ratios')).toBe('The P/E and P/B ratios');
  });
  it('turns LaTeX operators into plain typography', () => {
    expect(stripMath('trades at $17.7\\times P/E.$')).toBe('trades at 17.7x P/E.');
    expect(stripMath('growth of $\\approx 12\\%$')).toBe('growth of ~ 12%');
    expect(stripMath('$\\text{Net debt} \\rightarrow 0$')).toBe('Net debt → 0');
  });
  it('turns an escaped dollar into a dollar', () => {
    expect(stripMath('valuation of \\$114 billion')).toBe('valuation of $114 billion');
  });
  it('leaves ordinary dollar amounts alone, even two in one sentence', () => {
    expect(stripMath('costs $5 million versus $10 million')).toBe('costs $5 million versus $10 million');
    expect(stripMath('worth $114 billion (about ₹11 lakh crore)')).toBe('worth $114 billion (about ₹11 lakh crore)');
  });
  it('cleans a price written inside math, and a bracketed abbreviation', () => {
    expect(stripMath('LNG at $\\$22/mmBtu$ today')).toBe('LNG at $22/mmBtu today');
    expect(stripMath('margin $(EB/TDA/scm)$ fell')).toBe('margin (EB/TDA/scm) fell');
    expect(stripMath('a loss of US\\$6.5-7 million and $1.1\\times P/B$')).toBe('a loss of US$6.5-7 million and 1.1x P/B');
  });
  it('does not mistake two real prices for math when one is bracketed', () => {
    expect(stripMath('costs $(5) crore versus $6 crore')).toBe('costs $(5) crore versus $6 crore');
  });
  it('does not touch text with no dollars', () => {
    expect(stripMath('Plain text, 12% growth.')).toBe('Plain text, 12% growth.');
  });
});

describe('numberedItems', () => {
  const raw = [
    '1. What is ARPU trajectory?',
    '',
    'Why it matters and what to look for.',
    '',
    '1. How sustainable is cash flow?',
    '',
    'Capex against operating cash flow.',
    '',
    '1. Third question?',
    'A line directly under it.',
  ].join('\n');
  it('numbers the items 1, 2, 3 in order whatever the model wrote', () => {
    expect(numberedItems(raw).split('\n').map((l) => l.match(/^(\d+)\./)?.[1])).toEqual(['1', '2', '3']);
  });
  it('keeps an item’s description on its own line, with no blank lines between items', () => {
    const lines = numberedItems(raw).split('\n');
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe('1. What is ARPU trajectory? Why it matters and what to look for.');
    expect(lines[2]).toBe('3. Third question? A line directly under it.');
  });
  it('leaves text with no numbered items as it was', () => {
    expect(numberedItems('Just a paragraph.')).toBe('Just a paragraph.');
  });
  it('keeps any text before the first item', () => {
    expect(numberedItems('Intro line.\n\n1. A?\n2. B?')).toBe('Intro line.\n\n1. A?\n2. B?');
  });
});

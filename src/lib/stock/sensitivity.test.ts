import { describe, expect, it } from 'vitest';
import type { StockSignals } from './signals';
import { emphasizeNumbers, valuationSensitivity } from './sensitivity';

const signals = (over: { pe?: number | null; median?: number | null; vs?: number | null; cagr?: number | null; qs?: number | null; qp?: number | null } = {}): StockSignals => {
  const o = { pe: 98.1, median: 39.1, vs: 151, cagr: 25, qs: 33.4, qp: 126.4, ...over };
  return { valuation: { pe: o.pe, pb: null, peerMedianPe: o.median, peVsPeersPct: o.vs }, growth: { salesCagr3y: null, profitCagr3y: o.cagr, qtrSalesYoyPct: o.qs, qtrProfitYoyPct: o.qp } } as unknown as StockSignals;
};
const by = (s: StockSignals) => Object.fromEntries(valuationSensitivity(s).map((l) => [l.key, l]));

describe('valuationSensitivity', () => {
  it('computes the premium, the growth needed to reach the peer P/E, the PEG and the operating-leverage gap from the figures', () => {
    const l = by(signals());
    expect(l.premium.value).toBe('+151%');
    // (98.1 / 39.1) ^ (1/3) - 1 = 35.9%
    expect(l.required_growth.value).toBe('+36% a year');
    expect(l.peg.value).toBe('3.9x');
    expect(l.operating_leverage.value).toBe('+93.0 pts');
    expect(l.operating_leverage.note).toContain('Profit +126.4% against sales +33.4%');
  });
  it('says "not available" for any line it cannot compute, never an estimate', () => {
    const l = by(signals({ pe: null, vs: null, cagr: null, qp: null }));
    expect(l.premium.value).toBe('not available');
    expect(l.required_growth.value).toBe('not available');
    expect(l.peg.value).toBe('not available');
    expect(l.operating_leverage.value).toBe('not available');
  });
  it('does not make a PEG from a zero or negative growth rate, and says so for a stock already at or below the peer P/E', () => {
    expect(by(signals({ cagr: -5 })).peg.value).toBe('not available');
    expect(by(signals({ cagr: 0 })).peg.value).toBe('not available');
    expect(by(signals({ pe: 20, median: 30, vs: -33 })).required_growth.value).toBe('Already at or below the peer median');
  });
  it('words every line as arithmetic, never a verdict or a forecast', () => {
    for (const line of valuationSensitivity(signals())) expect(`${line.label} ${line.note}`).not.toMatch(/\b(buy|sell|undervalued|overvalued|will)\b/i);
    expect(by(signals()).required_growth.note).toMatch(/not a forecast/i);
  });
});

describe('emphasizeNumbers', () => {
  const join = (t: string) => emphasizeNumbers(t).map((p) => p.text).join('');
  it('bolds figures with their sign, rupee mark and unit, and leaves the words alone', () => {
    const parts = emphasizeNumbers('P/E of 98.1x against 39.1x; profit +126.4% on ₹560 Cr, ROCE 17.8%.');
    expect(parts.filter((p) => p.bold).map((p) => p.text)).toEqual(['98.1x', '39.1x', '+126.4%', '₹560 Cr', '17.8%']);
    expect(parts.filter((p) => !p.bold).map((p) => p.text).join('')).toContain('against');
  });
  it('always joins back to the original text, including text with no figures or an empty string', () => {
    for (const t of ['', 'No numbers here.', 'Q2 FY26 debt/equity 0.43x, up 3.5 pts since 2025.', '₹1,239.70 today']) expect(join(t)).toBe(t);
    expect(emphasizeNumbers('No numbers here.')).toEqual([{ text: 'No numbers here.', bold: false }]);
  });
  it('does not bold bare years or ordinals', () => {
    expect(emphasizeNumbers('In 2025 the company grew.').some((p) => p.bold)).toBe(false);
  });
});

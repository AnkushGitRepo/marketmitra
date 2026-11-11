// The valuation sensitivity check on the stock page (#152): plain arithmetic on figures we already hold, with no AI and no forecast. Each line
// says what it is and where it comes from; a figure we cannot compute is "not available", never estimated. Pure.

import { NOT_AVAILABLE, fmtSigned, fmtTimes } from './signalFormat';
import type { StockSignals } from './signals';

export type SensitivityKey = 'premium' | 'required_growth' | 'peg' | 'operating_leverage';

export interface SensitivityLine {
  key: SensitivityKey;
  label: string;
  value: string;
  /** How the figure is made, in a sentence. */
  note: string;
}

/** What our free data cannot tell, so no read here pretends to. */
export const STOCK_DATA_GAPS: readonly string[] = ['concall commentary', 'management and board profiles', 'pledged-share trends', 'analyst reports', '5-year median multiples'];

/** Years over which the growth needed to reach the peer P/E is spread. */
export const CONVERGENCE_YEARS = 3;

const ok = (n: number | null): n is number => n !== null && Number.isFinite(n);
const r1 = (n: number): string => n.toFixed(1);

export function valuationSensitivity(s: StockSignals): SensitivityLine[] {
  const { pe, peerMedianPe, peVsPeersPct } = s.valuation;
  const profitCagr = s.growth.profitCagr3y;
  const qSales = s.growth.qtrSalesYoyPct;
  const qProfit = s.growth.qtrProfitYoyPct;

  const premium: SensitivityLine = {
    key: 'premium',
    label: 'P/E against the peer median',
    value: fmtSigned(peVsPeersPct, 0, '%'),
    note: ok(pe) && ok(peerMedianPe) ? `P/E of ${fmtTimes(pe)} against a peer median of ${fmtTimes(peerMedianPe)}.` : 'Needs both this stock’s P/E and the peer median.',
  };

  let required = NOT_AVAILABLE;
  if (ok(pe) && ok(peerMedianPe) && pe > 0 && peerMedianPe > 0) {
    const g = (pe / peerMedianPe) ** (1 / CONVERGENCE_YEARS) - 1;
    required = g > 0 ? `${fmtSigned(g * 100, 0, '%')} a year` : 'Already at or below the peer median';
  }
  const requiredGrowth: SensitivityLine = {
    key: 'required_growth',
    label: `Profit growth needed over ${CONVERGENCE_YEARS} years to reach the peer P/E`,
    value: required,
    note: `With the price unchanged, the yearly profit growth at which today’s P/E would fall to the peer median in ${CONVERGENCE_YEARS} years: (P/E ÷ peer median) ^ (1 ÷ ${CONVERGENCE_YEARS}) − 1. Arithmetic, not a forecast.`,
  };

  const peg: SensitivityLine = {
    key: 'peg',
    label: 'PEG (P/E ÷ 3-year profit growth)',
    value: ok(pe) && pe > 0 && ok(profitCagr) && profitCagr > 0 ? fmtTimes(pe / profitCagr) : NOT_AVAILABLE,
    note: ok(profitCagr) ? `P/E divided by the 3-year profit CAGR of ${r1(profitCagr)}%. A higher figure means more growth is already in the price.` : 'Needs a positive 3-year profit CAGR, which our data does not give for this company.',
  };

  const operatingLeverage: SensitivityLine = {
    key: 'operating_leverage',
    label: 'Profit growth less sales growth (latest quarter, YoY)',
    value: ok(qProfit) && ok(qSales) ? `${fmtSigned(qProfit - qSales, 1)} pts` : NOT_AVAILABLE,
    note: ok(qProfit) && ok(qSales) ? `Profit ${fmtSigned(qProfit, 1, '%')} against sales ${fmtSigned(qSales, 1, '%')}. Positive means profit grew faster than sales. One quarter can be unrepresentative.` : 'Needs the latest quarter’s profit and sales growth.',
  };

  return [premium, requiredGrowth, peg, operatingLeverage];
}

export interface TextPart {
  text: string;
  bold: boolean;
}

// A figure with its sign, rupee mark and unit: ₹1,239.70, +126.4%, 98.1x, ₹560 Cr, 3.5 pts. Dates and plain years are not matched.
const FIGURE = /[+−-]?₹?\d[\d,]*(?:\.\d+)?(?:\s?(?:%|x|Cr|pts|bps)\b|%|x\b)/g;

/** Splits text into plain and bold runs so figures can be shown in bold. Pure; the parts always join back to the original. */
export function emphasizeNumbers(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(FIGURE)) {
    const start = m.index ?? 0;
    if (start > last) parts.push({ text: text.slice(last, start), bold: false });
    parts.push({ text: m[0], bold: true });
    last = start + m[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false });
  return parts.length ? parts : [{ text, bold: false }];
}

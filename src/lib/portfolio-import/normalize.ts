// Pure clean-up helpers for broker exports (ADR 0022, ADR 0075): Indian rupee strings, exchange suffixes, summary
// footers and tickers split across several buy tranches. No I/O, so they test without mocks.

import type { ExtractedHolding } from './types';

const CURRENCY_NOISE = /[₹$€£\s]|\brs\.?|\binr\b/gi;
const EXCHANGE_SUFFIX = /(?:-EQ|\.NS|\.BO|\.NSE|\.BSE)$/i;
const SUMMARY_LABEL = /^(?:grand\s+|net\s+|sub\s*)?(?:total|totals|summary)\s*:?$/i;
const PRICE_DECIMALS = 100;

/** "1,25,450.50", "₹2,310.35", "Rs. 99" → a number. Anything unreadable, or negative (including "(5)"), is NaN. */
export function parseAmount(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value !== 'string') return NaN;
  const text = value.trim();
  if (/^\(.*\)$/.test(text)) return NaN;
  const cleaned = text.replace(CURRENCY_NOISE, '').replace(/,/g, '');
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(cleaned)) return NaN;
  return Number(cleaned);
}

/**
 * Splits a symbol-column cell into a ticker or a company name. Exchange suffixes are removed ("RELIANCE-EQ",
 * "TCS.NS"). Text with spaces, or in mixed case ("Infosys"), is a company name; a single all-caps or all-lower
 * token is a ticker.
 */
export function normalizeSymbol(raw: string): { symbol: string | null; name: string | null } | null {
  const text = raw.trim();
  if (!text) return null;
  const stripped = text.replace(EXCHANGE_SUFFIX, '').trim();
  const hadSuffix = stripped.length !== text.length;
  const isToken = /^[A-Za-z0-9&.-]{1,20}$/.test(stripped);
  const singleCase = stripped === stripped.toUpperCase() || stripped === stripped.toLowerCase();
  if (stripped && isToken && (singleCase || hadSuffix)) return { symbol: stripped.toUpperCase(), name: null };
  return { symbol: null, name: text };
}

/** True for a footer label such as "Total" or "Grand Total"; a ticker that merely starts with "Total" is not one. */
export function isSummaryLabel(text: string): boolean {
  return SUMMARY_LABEL.test(text.trim());
}

const keyOf = (h: ExtractedHolding): string => (h.rawSymbol ? `s:${h.rawSymbol}` : `n:${(h.rawName ?? '').toLowerCase()}`);
const round2 = (n: number): number => Math.round(n * PRICE_DECIMALS) / PRICE_DECIMALS;

/** One row per stock: quantities add up and the average price is weighted by quantity. Order follows first appearance. */
export function mergeDuplicates(holdings: readonly ExtractedHolding[]): ExtractedHolding[] {
  const order: string[] = [];
  const merged = new Map<string, { base: ExtractedHolding; quantity: number; cost: number }>();
  for (const h of holdings) {
    const key = keyOf(h);
    const prev = merged.get(key);
    if (!prev) order.push(key);
    merged.set(key, {
      base: prev?.base ?? h,
      quantity: (prev?.quantity ?? 0) + h.quantity,
      cost: (prev?.cost ?? 0) + h.quantity * h.avgPrice,
    });
  }
  return order.map((key) => {
    const { base, quantity, cost } = merged.get(key)!;
    return { ...base, quantity, avgPrice: round2(cost / quantity) };
  });
}

// Validation for the quick-add row in the wizard. The server validates again (Zod in /api/holdings); this gives the
// user a plain message before the round trip.

export interface HoldingInputRaw {
  readonly symbol: string;
  readonly quantity: string;
  readonly avgPrice: string;
}

export interface HoldingInput {
  readonly symbol: string;
  readonly quantity: number;
  readonly avgPrice: number;
}

export type HoldingInputResult = { readonly ok: true; readonly value: HoldingInput } | { readonly ok: false; readonly error: string };

const MAX_QUANTITY = 1e9;
const MAX_PRICE = 1e7;

function toNumber(text: string): number {
  const cleaned = text.replace(/,/g, '').trim();
  return cleaned === '' ? NaN : Number(cleaned);
}

export function parseHoldingInput(raw: HoldingInputRaw): HoldingInputResult {
  const symbol = raw.symbol.trim().toUpperCase();
  if (!symbol) return { ok: false, error: 'Pick a stock from the search results.' };
  const quantity = toNumber(raw.quantity);
  if (!Number.isInteger(quantity) || quantity <= 0 || quantity > MAX_QUANTITY) {
    return { ok: false, error: 'Enter how many shares you hold (more than zero).' };
  }
  const avgPrice = toNumber(raw.avgPrice);
  if (!Number.isFinite(avgPrice) || avgPrice <= 0 || avgPrice > MAX_PRICE) {
    return { ok: false, error: 'Enter your average buy price (more than zero).' };
  }
  return { ok: true, value: { symbol, quantity, avgPrice } };
}

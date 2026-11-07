import {
  getCompany,
  getFinancials,
  getPrices,
  getRatios,
  getShareholding,
} from '@/lib/dashboard/fundamentalsApi';
import { DEFAULT_SCREEN_CONFIG } from './config';
import { normalizeScreenInputs } from './normalize';
import { runScreen } from './rules';
import type { ScreenData, ScreenResult } from './types';


export type ScreenDataOutcome =
  | { ok: true; name: string; sector: string | null; data: ScreenData }
  | { ok: false; error: string };

export type ScreenOutcome =
  | { ok: true; name: string; sector: string | null; result: ScreenResult }
  | { ok: false; error: string };

/** Fetch and normalise a company's fundamentals (no rules applied). */
export async function loadScreenData(symbol: string, asOf: string): Promise<ScreenDataOutcome> {
  const [company, pnl, bs, cf, ratios, holding, prices] = await Promise.all([
    getCompany(symbol),
    getFinancials(symbol, 'profit_and_loss'),
    getFinancials(symbol, 'balance_sheet'),
    getFinancials(symbol, 'cash_flow'),
    getRatios(symbol),
    getShareholding(symbol),
    getPrices(symbol, '5y'),
  ]);
  if (!company) return { ok: false, error: `No fundamentals found for ${symbol}.` };
  if (!pnl || !bs || !cf || !ratios || !holding) {
    return { ok: false, error: `Some fundamentals for ${symbol} could not be loaded — try again shortly.` };
  }
  const data = normalizeScreenInputs({
    symbol,
    sector: company.sector ?? null,
    asOf,
    profitAndLoss: pnl,
    balanceSheet: bs,
    cashFlow: cf,
    ratios,
    shareholding: holding,
    prices: prices ?? [],
  });
  return { ok: true, name: company.name, sector: company.sector ?? null, data };
}

/** Fetch a company's fundamentals and run the quality screen on them. */
export async function screenSymbol(symbol: string, asOf: string): Promise<ScreenOutcome> {
  const loaded = await loadScreenData(symbol, asOf);
  if (!loaded.ok) return loaded;
  return { ok: true, name: loaded.name, sector: loaded.sector, result: runScreen(loaded.data, DEFAULT_SCREEN_CONFIG) };
}

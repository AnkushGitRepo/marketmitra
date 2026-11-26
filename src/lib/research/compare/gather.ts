// Loads what the head-to-head report needs (#394): for each company its profile, ratios, annual sales and operating profit, and its
// row in the data service (growth, debt, price to book). The data service is passed in so this tests without a network. A figure
// the data lacks stays null, and a company that cannot be found is reported by name, never silently dropped.

import type { CompanyOut, LineItemOut, RatioOut } from '@/lib/dashboard/fundamentalsApi';
import type { ScreenerFilters, ScreenerPage, ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import { buildCompanyData } from '../companyData';
import type { ResolvedSymbol } from '../resolveSymbol';
import type { CompareCompany } from './analysis';

export interface CompareGetters {
  readonly resolve: (raw: string) => Promise<ResolvedSymbol | null>;
  readonly company: (symbol: string) => Promise<CompanyOut | null>;
  readonly ratios: (symbol: string) => Promise<RatioOut[] | null>;
  readonly profitAndLoss: (symbol: string) => Promise<LineItemOut[] | null>;
  readonly page: (filters: ScreenerFilters) => Promise<ScreenerPage>;
}

export const MIN_COMPANIES = 2;
export const MAX_COMPANIES = 4;

export type GatherResult = { readonly companies: readonly CompareCompany[] } | { readonly unknown: readonly string[] };

const orNull = async <T>(read: Promise<T | null>): Promise<T | null> => {
  try {
    return await read;
  } catch {
    return null;
  }
};

const rowFor = async (g: CompareGetters, symbol: string): Promise<ScreenerResultRow | null> => {
  try {
    const page = await g.page({ q: symbol, board: 'all', limit: 10 });
    return page.rows.find((r) => r.symbol.toUpperCase() === symbol.toUpperCase()) ?? null;
  } catch {
    return null;
  }
};

async function load(g: CompareGetters, resolved: ResolvedSymbol): Promise<CompareCompany> {
  const [company, ratios, pl, row] = await Promise.all([orNull(g.company(resolved.symbol)), orNull(g.ratios(resolved.symbol)), orNull(g.profitAndLoss(resolved.symbol)), rowFor(g, resolved.symbol)]);
  const data = buildCompanyData({ symbol: resolved.symbol, name: resolved.name, ratios, profitAndLoss: pl, shareholding: null });
  const r = data.ratios;
  return {
    symbol: resolved.symbol,
    name: resolved.name,
    sector: company?.sector ?? row?.sector ?? null,
    industry: company?.industry ?? row?.industry ?? null,
    marketCap: row?.market_cap ?? r['Market Cap'] ?? null,
    pe: row?.pe ?? r['Stock P/E'] ?? null,
    pb: row?.pb ?? null,
    roce: row?.roce ?? r['ROCE'] ?? null,
    roe: row?.roe ?? r['ROE'] ?? null,
    debtToEquity: row?.debt_to_equity ?? null,
    dividendYield: row?.dividend_yield ?? r['Dividend Yield'] ?? null,
    salesCagr3y: row?.sales_growth_3y_cagr ?? null,
    profitCagr3y: row?.profit_growth_3y_cagr ?? null,
    annual: data.annual,
  };
}

/** The companies typed, resolved and loaded in the order given (each once); or the names that match no listed company. */
export async function gatherCompareInputs(typed: readonly string[], g: CompareGetters): Promise<GatherResult> {
  const resolved = await Promise.all(typed.map((raw) => orNull(g.resolve(raw))));
  const unknown = typed.filter((_, i) => resolved[i] === null);
  if (unknown.length > 0) return { unknown };
  const seen = new Set<string>();
  const distinct = (resolved as ResolvedSymbol[]).filter((r) => !seen.has(r.symbol) && seen.add(r.symbol));
  return { companies: await Promise.all(distinct.map((r) => load(g, r))) };
}

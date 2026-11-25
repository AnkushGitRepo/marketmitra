import type { SearchResultOut } from '@/lib/dashboard/fundamentalsApi';
import { resolveSymbolAlias } from './symbolAliases';

export interface ResolvedSymbol {
  readonly symbol: string;
  readonly name: string;
}

export interface ResolveSymbolDeps {
  readonly getCompany: (symbol: string) => Promise<{ name: string } | null>;
  readonly searchSymbols: (query: string) => Promise<SearchResultOut[]>;
}

/** What the user typed (an NSE symbol, a brand name or a company name) as a listed company, or null. */
export async function resolveSymbol(raw: string, deps: ResolveSymbolDeps): Promise<ResolvedSymbol | null> {
  const direct = resolveSymbolAlias(raw);
  if (!direct) return null;
  const company = await deps.getCompany(direct);
  if (company) return { symbol: direct, name: company.name };

  const hit = (await deps.searchSymbols(raw.trim())).find((r) => r.type === 'company');
  if (!hit) return null;
  const found = await deps.getCompany(hit.symbol);
  return found ? { symbol: hit.symbol, name: found.name } : null;
}

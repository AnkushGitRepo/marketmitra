// The Theme picker's suggestions with the top tickers of each (#378). The data service is passed in so it tests without a network.

import type { ScreenerFilters, ScreenerPage } from '@/lib/dashboard/screenerSchema';
import { buildThemeOptions, suggestThemes, type ThemeFacets, type ThemeKind } from './themeSearch';

export interface ThemeSuggestion {
  readonly kind: ThemeKind;
  readonly label: string;
  /** Listed companies in the theme. */
  readonly count: number;
  /** The largest by market cap, as NSE symbols. */
  readonly topTickers: readonly string[];
}

export interface SuggestionDeps {
  readonly facets: () => Promise<ThemeFacets>;
  readonly page: (filters: ScreenerFilters) => Promise<ScreenerPage>;
}

const TICKERS = 4;
/** A theme can span many industries; the largest few are enough to name its biggest companies. */
const INDUSTRIES_LOOKED_AT = 2;

export async function themeSuggestions(text: string, deps: SuggestionDeps, limit = 6): Promise<ThemeSuggestion[]> {
  const facets = await deps.facets();
  const chosen = suggestThemes(buildThemeOptions(facets), text, limit);
  return Promise.all(
    chosen.map(async (option) => {
      const biggest = [...option.industries].sort((a, b) => (facets.industry_counts?.[b] ?? 0) - (facets.industry_counts?.[a] ?? 0)).slice(0, INDUSTRIES_LOOKED_AT);
      const queries: ScreenerFilters[] = option.sectors.length > 0 ? [{ sector: option.sectors[0], limit: TICKERS, offset: 0 }] : biggest.map((industry) => ({ industry, limit: TICKERS, offset: 0 }));
      const pages = await Promise.all(queries.map((q) => deps.page(q)));
      const topTickers = pages
        .flatMap((p) => p.rows)
        .sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0))
        .slice(0, TICKERS)
        .map((r) => r.symbol);
      return { kind: option.kind, label: option.label, count: option.count, topTickers };
    })
  );
}

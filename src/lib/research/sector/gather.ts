// Loads the listed companies behind a theme (#380): resolves the typed text to the data service's industries, then takes the
// largest of each. The data service is passed in so this tests without a network.

import type { ScreenerFilters, ScreenerPage, ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import { buildThemeOptions, resolveTheme, type ThemeFacets } from '../themeSearch';
import type { SectorInputs } from './inputs';

export interface SectorGetters {
  readonly facets: () => Promise<ThemeFacets>;
  readonly page: (filters: ScreenerFilters) => Promise<ScreenerPage>;
}

/** Companies fetched from each industry; the largest ones carry the sector's figures. */
const ROWS_PER_INDUSTRY = 40;
/** A theme can span many industries; the largest few hold nearly all of it. */
const MAX_INDUSTRIES = 6;

/** Null when the text matches no theme, or the data service returned no companies. */
export async function gatherSectorInputs(text: string, g: SectorGetters): Promise<SectorInputs | null> {
  const facets = await g.facets();
  const option = resolveTheme(buildThemeOptions(facets), text);
  if (!option) return null;
  const industries = [...option.industries].sort((a, b) => (facets.industry_counts?.[b] ?? 0) - (facets.industry_counts?.[a] ?? 0)).slice(0, MAX_INDUSTRIES);
  const queries: ScreenerFilters[] = [
    ...option.sectors.map((sector) => ({ sector, limit: ROWS_PER_INDUSTRY, offset: 0 })),
    ...industries.map((industry) => ({ industry, limit: ROWS_PER_INDUSTRY, offset: 0 })),
  ];
  const pages = await Promise.all(queries.map((q) => g.page(q)));
  const seen = new Set<string>();
  const rows = pages
    .flatMap((p) => p.rows)
    .filter((r: ScreenerResultRow) => !seen.has(r.symbol) && seen.add(r.symbol))
    .sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
  if (rows.length === 0) return null;
  return { label: option.label, kind: option.kind, industries: option.industries, sectors: option.sectors, count: option.count, rows };
}

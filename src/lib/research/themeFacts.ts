import { getScreenerFacets, runScreenerPage } from '@/lib/dashboard/screener';
import type { ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import type { FactBlock } from '@/lib/ai/researchPrompts';
import { matchThemeToSectors } from './themes';

const LEADERS_PER_SECTOR = 8;
const MAX_SECTORS = 3;

const fmt = (v: number | null): string => (v === null ? '—' : String(Math.round(v * 10) / 10));

function leaderLine(r: ScreenerResultRow): string {
  const cap = r.market_cap === null ? '—' : `₹${Math.round(r.market_cap)} Cr`;
  return (
    `- ${r.name} (${r.symbol}): market cap ${cap}, P/E ${fmt(r.pe)}, ROCE ${fmt(r.roce)}, ROE ${fmt(r.roe)}, ` +
    `3y sales CAGR ${fmt(r.sales_growth_3y_cagr)}, 3y profit CAGR ${fmt(r.profit_growth_3y_cagr)}`
  );
}

/** Pure: the fact block for a theme from the sectors it matched and their biggest companies. */
export function buildThemeFactBlocks(
  theme: string,
  sectors: readonly string[],
  leaders: readonly ScreenerResultRow[],
  total: number
): FactBlock[] {
  if (sectors.length === 0) {
    return [
      {
        heading: `Sector data for "${theme}"`,
        body: 'No listed sector matched this theme, so there are no company figures for it. Say so rather than inventing any.',
      },
    ];
  }
  return [
    {
      heading: `${sectors.join(' / ')} — largest listed companies (${total} companies in the sector${sectors.length > 1 ? 's' : ''})`,
      body: leaders.map(leaderLine).join('\n') || 'No company rows were returned.',
    },
  ];
}

/** The listed companies behind a theme: matches it to the data service's sectors, then takes the biggest by market cap. */
export async function themeFacts(theme: string): Promise<FactBlock[]> {
  const facets = await getScreenerFacets();
  const sectors = matchThemeToSectors(theme, facets.sectors).slice(0, MAX_SECTORS);
  const pages = await Promise.all(
    sectors.map((sector) => runScreenerPage({ sector, limit: LEADERS_PER_SECTOR, offset: 0 }))
  );
  const leaders = pages
    .flatMap((p) => p.rows)
    .sort((a, b) => (b.market_cap ?? 0) - (a.market_cap ?? 0));
  return buildThemeFactBlocks(
    theme,
    sectors,
    leaders,
    pages.reduce((n, p) => n + p.total, 0)
  );
}

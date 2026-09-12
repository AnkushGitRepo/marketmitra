import { runScreener, getScreenerFacets } from '@/lib/dashboard/screener';
import type { ScreenerFilters } from '@/lib/dashboard/screenerSchema';
import { ScreenerPageClient } from './ScreenerPageClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

// A defensible "reasonably profitable, not overleveraged" starting screen
// (ADR 0025) — adjustable in the UI, just not blank on first load.
const DEFAULT_FILTERS: ScreenerFilters = { roe_min: 15, debt_to_equity_max: 1 };

export default async function ScreenerPage() {
  const [results, facets] = await Promise.all([runScreener(DEFAULT_FILTERS), getScreenerFacets()]);

  return (
    <div className={styles.pageRoot}>
      <p className={styles.eyebrow}>Screener</p>
      <h1 className={styles.h1}>Stock screener</h1>
      <p className={styles.introNote}>
        Filter the NSE stock universe by market cap, valuation, profitability, leverage, and
        growth. Data is bulk-refreshed at most once daily from a wider scrape than any single
        stock&rsquo;s live detail page — a company missing here just hasn&rsquo;t been scraped
        successfully yet, not confirmed to have no data.
      </p>
      <ScreenerPageClient
        initialResults={results}
        initialFilters={DEFAULT_FILTERS}
        sectors={facets.sectors}
      />
    </div>
  );
}

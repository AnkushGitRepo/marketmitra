import { runScreener, getScreenerFacets, getScreenerStats } from '@/lib/dashboard/screener';
import type { ScreenerFilters } from '@/lib/dashboard/screenerSchema';
import { ScreenerPageClient } from './ScreenerPageClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

// A defensible "reasonably profitable, not overleveraged" starting screen
// (ADR 0025) — adjustable in the UI, just not blank on first load.
const FUNDAMENTALS_DEFAULT: ScreenerFilters = { roe_min: 15, debt_to_equity_max: 1, sort_by: 'roe' };
// Until the incremental Screener.in job has covered enough of the universe, an
// ROE/debt default would show a tiny, biased list — start from size instead.
const QUOTE_ONLY_DEFAULT: ScreenerFilters = { market_cap_min: 5000, sort_by: 'market_cap' };
const MIN_FUNDAMENTALS_FOR_DEFAULT = 300;

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default async function ScreenerPage() {
  const stats = await getScreenerStats();
  const defaultFilters =
    (stats?.with_fundamentals ?? 0) >= MIN_FUNDAMENTALS_FOR_DEFAULT ? FUNDAMENTALS_DEFAULT : QUOTE_ONLY_DEFAULT;
  const [results, facets] = await Promise.all([runScreener(defaultFilters), getScreenerFacets()]);
  const pricesAsOf = formatDate(stats?.quotes_updated_at ?? null);

  return (
    <div className={styles.pageRoot}>
      <p className={styles.eyebrow}>Screener</p>
      <h1 className={styles.h1}>Stock screener</h1>
      <p className={styles.introNote}>
        Filter the NSE stock universe by market cap, valuation, profitability, leverage, and
        growth. Market cap, price, P/E, P/B and dividend yield refresh daily for every listed
        company; ROE, ROCE, debt/equity and growth are scraped in rotation, stalest first.
        A dash means that figure isn&rsquo;t available yet, not that it&rsquo;s zero.
      </p>
      {stats && (
        <p className={styles.introNote} data-testid="screener-coverage">
          {pricesAsOf ? `Prices as of ${pricesAsOf}. ` : ''}
          Fundamentals available for {stats.with_fundamentals.toLocaleString('en-IN')} of{' '}
          {stats.universe.toLocaleString('en-IN')} companies — ROE, ROCE, debt and growth filters
          only match those.
        </p>
      )}
      <ScreenerPageClient
        initialResults={results}
        initialFilters={defaultFilters}
        sectors={facets.sectors}
      />
    </div>
  );
}

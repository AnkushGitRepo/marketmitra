import { runScreenerPage, getScreenerFacets, getScreenerStats } from '@/lib/dashboard/screener';
import type { ScreenerFilters } from '@/lib/dashboard/screenerSchema';
import { parseScreenerParams, MAX_PAGE_SIZE } from '@/lib/screener/params';
import { ScreenerInfo } from '@/components/screener/ScreenerInfo';
import { ScreenerPageClient } from './ScreenerPageClient';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from './pageMath';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

// A defensible "reasonably profitable, not overleveraged" starting screen
// (ADR 0025) — adjustable in the UI, just not blank on first load.
const FUNDAMENTALS_DEFAULT: ScreenerFilters = {
  roe_min: 15,
  debt_to_equity_max: 1,
  sort_by: 'roe',
};
// Until the incremental Screener.in job has covered enough of the universe, an
// ROE/debt default would show a tiny, biased list — start from size instead.
const QUOTE_ONLY_DEFAULT: ScreenerFilters = { market_cap_min: 5000, sort_by: 'market_cap' };
const MIN_FUNDAMENTALS_FOR_DEFAULT = 300;

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function ScreenerPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const stats = await getScreenerStats();
  const defaultFilters =
    (stats?.with_fundamentals ?? 0) >= MIN_FUNDAMENTALS_FOR_DEFAULT
      ? FUNDAMENTALS_DEFAULT
      : QUOTE_ONLY_DEFAULT;

  // The URL is the source of truth once the user has touched anything (it is
  // kept in sync by the client), so a shared link or a reload restores the
  // exact screen. An invalid or empty query falls back to the default screen.
  const parsed = parseScreenerParams({ get: (key: string) => firstValue(params[key]) });
  const fromUrl = parsed.ok ? parsed.filters : {};
  const { limit, offset, ...urlFilters } = fromUrl;
  const hasUrlState = Object.keys(urlFilters).length > 0;
  const filters: ScreenerFilters = hasUrlState ? urlFilters : defaultFilters;

  const pageSize =
    limit && (PAGE_SIZES as readonly number[]).includes(limit) ? limit : DEFAULT_PAGE_SIZE;
  const pageIndex = Math.floor((offset ?? 0) / pageSize);

  const [{ rows, total }, facets] = await Promise.all([
    runScreenerPage({
      ...filters,
      limit: Math.min(pageSize, MAX_PAGE_SIZE),
      offset: pageIndex * pageSize,
    }),
    getScreenerFacets(),
  ]);
  const pricesAsOf = formatDate(stats?.quotes_updated_at ?? null);

  return (
    <div className={styles.pageRoot}>
      <p className={styles.eyebrow}>Screener</p>
      <div className={styles.titleRow}>
        <h1 className={styles.h1}>Stock screener</h1>
        <ScreenerInfo
          intro="Filter the NSE stock universe by market cap, valuation, profitability, leverage, and growth. Market cap, price, P/E, P/B and dividend yield refresh daily for every listed company; ROE, ROCE, debt/equity and growth are scraped in rotation, stalest first. A dash means that figure isn’t available yet, not that it’s zero."
          coverage={
            stats
              ? `${pricesAsOf ? `Prices as of ${pricesAsOf}. ` : ''}Fundamentals available for ${stats.with_fundamentals.toLocaleString('en-IN')} of ${stats.universe.toLocaleString('en-IN')} companies. ROE, ROCE, debt and growth filters only match those.`
              : null
          }
        />
      </div>
      <ScreenerPageClient
        // Remount when the URL state changes from outside (e.g. Mitra opening a
        // new screen while this page is already showing), since the client
        // component seeds its state from these props once.
        key={JSON.stringify([filters, pageIndex, pageSize])}
        initialResults={rows}
        initialTotal={total}
        initialFilters={filters}
        initialPage={pageIndex}
        initialPageSize={pageSize}
        facets={facets}
        fundamentalsReady={(stats?.with_fundamentals ?? 0) >= MIN_FUNDAMENTALS_FOR_DEFAULT}
      />
    </div>
  );
}

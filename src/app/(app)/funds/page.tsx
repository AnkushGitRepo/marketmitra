import { DataUnavailable } from '@/components/common/DataUnavailable';
import { getFundFacets, listFunds } from '@/lib/funds/api';
import { formatDate } from '@/lib/funds/format';
import { effectiveFilters, resolveFilters } from '@/lib/funds/defaultView';
import { parseFundParams, type FundFilters } from '@/lib/funds/params';
import { DEFAULT_PAGE_SIZE, PAGE_SIZES } from '@/app/(app)/screener/pageMath';
import { FundsPageClient } from './FundsPageClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | null {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

export default async function FundsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  // The URL is the source of truth once the user has touched anything, so a shared link restores the exact screen.
  const parsed = parseFundParams({ get: (key: string) => firstValue(params[key]) });
  const { limit, offset, ...urlFilters } = parsed.ok ? parsed.filters : ({} as FundFilters);
  const filters = resolveFilters(urlFilters);

  const pageSize = limit && (PAGE_SIZES as readonly number[]).includes(limit) ? limit : DEFAULT_PAGE_SIZE;
  const pageIndex = Math.floor((offset ?? 0) / pageSize);
  const [firstTry, facets, withReturns, everyFund] = await Promise.all([
    listFunds(effectiveFilters({ ...filters, limit: pageSize, offset: pageIndex * pageSize })),
    getFundFacets(),
    listFunds({ plan: 'direct', min_ret_1y: -100, limit: 1 }),
    listFunds({ plan: 'direct', limit: 1 }),
  ]);
  // A shared link can point past the end once the data shrinks: land on the last page, not an empty one.
  const lastPageIndex = firstTry && firstTry.total > 0 ? Math.floor((firstTry.total - 1) / pageSize) : 0;
  const stale = firstTry !== null && firstTry.items.length === 0 && firstTry.total > 0 && pageIndex > lastPageIndex;
  const page = stale ? await listFunds(effectiveFilters({ ...filters, limit: pageSize, offset: lastPageIndex * pageSize })) : firstTry;
  const shownPageIndex = stale ? lastPageIndex : pageIndex;

  return (
    <div className={styles.pageRoot}>
      <p className={styles.eyebrow}>Funds</p>
      <h1 className={styles.h1}>Mutual fund screener</h1>
      <p className={styles.intro}>
        Browse Indian mutual funds by category, fund house, returns and risk. Returns and ratios are calculated from the
        daily NAV that AMFI publishes; one year and longer are annualised.
        {facets.nav_as_of ? ` NAVs as of ${formatDate(facets.nav_as_of)}.` : ''} A dash means the figure is not available
        yet (a young fund, or a detail we have not been given), not zero.
      </p>

      {page ? (
        <FundsPageClient
          // Remount when the URL state changes from outside, since the client component seeds its state from these props once.
          key={JSON.stringify([filters, shownPageIndex, pageSize])}
          initialPage={page}
          initialFilters={filters}
          facets={facets}
          coverage={{ withReturns: withReturns?.total ?? 0, total: everyFund?.total ?? 0 }}
        />
      ) : (
        <DataUnavailable>
          <p className={styles.unavailable}>The mutual fund data did not load.</p>
        </DataUnavailable>
      )}

      <p className={styles.notice}>
        Past performance does not indicate future returns. This is reference data, not investment advice. NAVs come from
        AMFI; ratios are our own calculation and can differ from a fund house or rating agency.
      </p>
    </div>
  );
}

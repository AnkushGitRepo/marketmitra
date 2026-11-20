'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Pagination } from '@/app/(app)/screener/Pagination';
import { pageCountFor } from '@/app/(app)/screener/pageMath';
import { FundsTable, type FundSort } from '@/components/funds/FundsTable';
import { FundsToolbar } from '@/components/funds/FundsToolbar';
import { LensBar } from '@/components/funds/LensBar';
import {
  canonicalQuery,
  describeFilters,
  draftFromFilters,
  filtersFromDraft,
  type Draft,
  type DraftKey,
  type FilterChip,
} from '@/lib/funds/draft';
import { activeLens, lensFilters, type Lens } from '@/lib/funds/lenses';
import { buildFundsQuery, type FundFilters, type FundPlan, type FundSortKey } from '@/lib/funds/params';
import type { FundFacets, FundPage } from '@/lib/funds/types';
import styles from './page.module.css';

interface FundsPageClientProps {
  readonly initialPage: FundPage;
  readonly initialFilters: FundFilters;
  readonly facets: FundFacets;
  /** How many funds have return figures, of all those in the Direct plan: the rest show dashes. */
  readonly coverage: { readonly withReturns: number; readonly total: number };
}

interface Requested {
  readonly filters: FundFilters;
  readonly page: number;
  readonly size: number;
}

interface SubmitOptions {
  readonly page?: number;
  readonly size?: number;
}

const PAGE_PATH = '/funds';
/** Typing pauses this long before the screen re-runs. */
const DEBOUNCE_MS = 300;
const INSTANT_KEYS: readonly DraftKey[] = ['category', 'sub_category', 'fund_house'];

export const DEFAULT_SORT: FundSort = { key: 'ret_3y', dir: 'desc' };
/** What "Clear all" returns to: every Direct-Growth fund, best 3-year return first. */
const CLEARED: FundFilters = { plan: 'direct', sort: 'ret_3y', order: 'desc' };

function sortOf(filters: FundFilters): FundSort {
  return { key: filters.sort ?? DEFAULT_SORT.key, dir: filters.order ?? DEFAULT_SORT.dir };
}

export function FundsPageClient({ initialPage, initialFilters, facets, coverage }: FundsPageClientProps) {
  const initialLimit = initialPage.limit;
  const initialPageIndex = Math.floor(initialPage.offset / initialLimit);
  const [draft, setDraft] = useState<Draft>(() => draftFromFilters(initialFilters));
  const [applied, setApplied] = useState<FundFilters>(initialFilters);
  const [page, setPage] = useState(initialPageIndex);
  const [pageSize, setPageSize] = useState(initialLimit);
  const [data, setData] = useState<FundPage>(initialPage);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const requestId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRef = useRef(draft);
  // The newest screen *asked for* (set the moment a request starts), not the newest answer. Every action merges
  // against this, so two quick actions (sort, then plan) both survive and an older answer cannot undo a newer ask.
  const initialRequested: Requested = { filters: initialFilters, page: initialPageIndex, size: initialLimit };
  const requested = useRef<Requested>(initialRequested);
  // The last screen that actually loaded: where "asked for" falls back to when a request fails, so retrying is not a no-op.
  const lastGood = useRef<Requested>(initialRequested);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      // An unmounted instance must not land a late answer or rewrite the address bar.
      requestId.current += 1;
    },
    [],
  );

  const cancelPending = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  const updateDraft = (next: Draft) => {
    draftRef.current = next;
    setDraft(next);
  };

  const load = useCallback(async (filters: FundFilters, nextPage: number, nextSize: number) => {
    const id = ++requestId.current;
    requested.current = { filters, page: nextPage, size: nextSize };
    setLoading(true);
    setError(null);
    const query = buildFundsQuery({ ...filters, limit: nextSize, offset: nextPage * nextSize });
    try {
      const response = await fetch(`/api/funds?${query}`);
      if (id !== requestId.current) return;
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { message?: string } | null;
        if (id === requestId.current) {
          requested.current = lastGood.current;
          setError(payload?.message ?? 'Could not run that screen.');
        }
        return;
      }
      const next = (await response.json()) as FundPage;
      if (id !== requestId.current) return;
      lastGood.current = { filters, page: nextPage, size: nextSize };
      setData(next);
      setApplied(filters);
      setPage(nextPage);
      setPageSize(nextSize);
      // Keep the URL shareable and reload-safe without a server round trip.
      window.history.replaceState(null, '', `${PAGE_PATH}?${query}`);
    } catch {
      if (id === requestId.current) {
        requested.current = lastGood.current;
        setError('Could not reach the fund data. Try again in a moment.');
      }
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  /**
   * Run the screen for "what was last asked, changed by `mutate`, plus whatever is typed in the panel".
   * Flushing the typed draft here is what keeps the inputs and the results agreeing.
   */
  const submit = useCallback(
    (mutate: (filters: FundFilters) => FundFilters, options: SubmitOptions = {}) => {
      cancelPending();
      const current = requested.current;
      const built = filtersFromDraft(draftRef.current, mutate(current.filters), facets.sub_categories);
      if (!built.ok) {
        setError(built.error);
        return;
      }
      setError(null);
      const filtersChanged = canonicalQuery(built.filters) !== canonicalQuery(current.filters);
      const size = options.size ?? current.size;
      // A new screen starts at page 1; so does a new page size.
      const nextPage = filtersChanged || size !== current.size ? 0 : (options.page ?? current.page);
      if (!filtersChanged && nextPage === current.page && size === current.size) return;
      void load(built.filters, nextPage, size);
    },
    [load, facets.sub_categories],
  );

  const handleChange = (key: DraftKey, value: string) => {
    // Changing category invalidates a sub-category chosen under the old one.
    updateDraft({ ...draftRef.current, [key]: value, ...(key === 'category' ? { sub_category: '' } : {}) });
    cancelPending();
    timer.current = setTimeout(() => submit((f) => f), INSTANT_KEYS.includes(key) ? 0 : DEBOUNCE_MS);
  };

  const handleLens = (lens: Lens) => {
    cancelPending();
    // A lens replaces the whole screen, so the panel is reset to match before it runs.
    const next = lensFilters(lens, requested.current.filters);
    updateDraft(draftFromFilters(next));
    submit(() => next);
  };

  const handlePlan = (plan: FundPlan) => submit((f) => ({ ...f, plan }));

  const handleSort = (key: FundSortKey) => {
    const current = sortOf(requested.current.filters);
    // Names read A-Z first; every figure reads best-first.
    const firstDir = key === 'name' || key === 'expense_ratio' || key === 'std_dev_3y' ? 'asc' : 'desc';
    const dir = current.key === key ? (current.dir === 'desc' ? 'asc' : 'desc') : firstDir;
    submit((f) => ({ ...f, sort: key, order: dir }));
  };

  const handleClear = () => {
    updateDraft(draftFromFilters(CLEARED));
    submit((f) => ({ ...CLEARED, plan: f.plan ?? 'direct' }));
  };

  const handleRemoveChip = (chip: FilterChip) => {
    cancelPending();
    // Fold in anything still being typed first, then drop what the chip stood for.
    const flushed = filtersFromDraft(draftRef.current, requested.current.filters, facets.sub_categories);
    if (!flushed.ok) {
      setError(flushed.error);
      return;
    }
    const next: FundFilters = Object.fromEntries(
      Object.entries(flushed.filters).filter(([key]) => !chip.keys.includes(key as keyof FundFilters)),
    );
    updateDraft(draftFromFilters(next));
    submit(() => next);
  };

  const lastPage = pageCountFor(data.total, pageSize) - 1;

  return (
    <>
      <LensBar active={activeLens(applied)} loading={loading} onSelect={handleLens} onClear={handleClear} />
      {coverage.withReturns < coverage.total && (
        <p className={styles.coverage}>
          Returns and risk figures are calculated for {coverage.withReturns.toLocaleString('en-IN')} of{' '}
          {coverage.total.toLocaleString('en-IN')} funds so far; the others show a dash.
        </p>
      )}
      <FundsToolbar
        draft={draft}
        plan={applied.plan ?? 'direct'}
        facets={facets}
        chips={describeFilters(applied)}
        error={error}
        onChange={handleChange}
        onPlanChange={handlePlan}
        onRemoveChip={handleRemoveChip}
        onClear={handleClear}
      />
      <p className={styles.resultsCount} aria-live="polite">
        {data.total.toLocaleString('en-IN')} {data.total === 1 ? 'fund' : 'funds'}
      </p>
      <FundsTable funds={data.items} sort={sortOf(applied)} loading={loading} onSort={handleSort} onClear={handleClear} />
      <Pagination
        page={Math.min(page, lastPage)}
        pageSize={pageSize}
        total={data.total}
        disabled={loading}
        onPageChange={(next) => submit((f) => f, { page: next })}
        onPageSizeChange={(size) => submit((f) => f, { size })}
      />
    </>
  );
}

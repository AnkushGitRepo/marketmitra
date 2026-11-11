'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FilterSheet } from '@/components/screener/FilterSheet';
import { MobileActionBar } from '@/components/screener/MobileActionBar';
import { ScreenerToolbar } from '@/components/screener/ScreenerToolbar';
import type { DraftKey } from '@/components/screener/FilterFields';
import {
  buildScreenerQuery,
  type RangeFieldKey,
  type ScreenerFacets,
  type ScreenerFilters,
  type ScreenerResultRow,
} from '@/lib/dashboard/screenerSchema';
import { buildFilters, describeFilters, draftFromFilters, withoutKeys, type Draft } from '@/lib/screener/draft';
import type { ScreenerPreset } from '@/lib/screener/presets';
import { activeFilterCount, cardMetricKeys, highlightedKeys, parseSortValue, sortValueOf } from '@/lib/screener/view';
import { ScreenerResults, type SortState } from './ScreenerResults';
import { pageCountFor } from './pageMath';

interface ScreenerPageClientProps {
  initialResults: ScreenerResultRow[];
  initialTotal: number;
  initialFilters: ScreenerFilters;
  initialPage: number;
  initialPageSize: number;
  facets: ScreenerFacets;
  fundamentalsReady: boolean;
}

const PAGE_PATH = '/screener';
// What "Clear all" returns to: every company, biggest first.
const CLEARED: ScreenerFilters = { sort_by: 'market_cap' };
/** Typing pauses this long before the screen re-runs. */
const DEBOUNCE_MS = 300;

function sortOf(filters: ScreenerFilters): SortState | null {
  return filters.sort_by ? { key: filters.sort_by, dir: filters.order ?? 'desc' } : null;
}

export function ScreenerPageClient({
  initialResults,
  initialTotal,
  initialFilters,
  initialPage,
  initialPageSize,
  facets,
  fundamentalsReady,
}: ScreenerPageClientProps) {
  const [draft, setDraft] = useState<Draft>(() => draftFromFilters(initialFilters));
  const [applied, setApplied] = useState<ScreenerFilters>(initialFilters);
  const [page, setPage] = useState(initialPage);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [data, setData] = useState({ rows: initialResults, total: initialTotal });
  const [industries, setIndustries] = useState<string[]>(facets.industries);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // Only the newest request may update the screen (fast typing, slow network).
  const requestId = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The debounced callback must see the filters applied *now*, not those from when it was scheduled.
  const appliedRef = useRef(initialFilters);
  const pageSizeRef = useRef(initialPageSize);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const load = useCallback(async (filters: ScreenerFilters, nextPage: number, nextSize: number) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    const query = buildScreenerQuery({ ...filters, limit: nextSize, offset: nextPage * nextSize });
    try {
      const response = await fetch(`/api/screener?${query}`);
      if (id !== requestId.current) return;
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.message ?? 'Could not run that screen.');
        return;
      }
      const rows = (await response.json()) as ScreenerResultRow[];
      const total = Number(response.headers.get('x-total-count'));
      if (id !== requestId.current) return;
      setData({ rows, total: Number.isFinite(total) ? total : rows.length });
      appliedRef.current = filters;
      pageSizeRef.current = nextSize;
      setApplied(filters);
      setPage(nextPage);
      setPageSize(nextSize);
      // Keep the URL shareable and reload-safe without a server round trip.
      window.history.replaceState(null, '', `${PAGE_PATH}?${query}`);
    } catch {
      if (id === requestId.current) setError('Could not reach the screener. Try again in a moment.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  const cancelPending = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  /** Validates a draft and runs it. An invalid draft is reported and does not query. */
  const applyDraft = useCallback(
    (next: Draft) => {
      const built = buildFilters(next, appliedRef.current);
      if (!built.ok) {
        setError(built.error);
        return;
      }
      setError(null);
      if (buildScreenerQuery(built.filters) === buildScreenerQuery(appliedRef.current)) return;
      setActivePresetId(null);
      void load(built.filters, 0, pageSizeRef.current);
    },
    [load]
  );

  const handleChange = (key: DraftKey, value: string) => {
    const next: Draft = { ...draft, [key]: value, ...(key === 'sector' ? { industry: '' } : {}) };
    setDraft(next);

    if (key === 'sector') {
      // Industry options follow the chosen sector.
      if (!value) setIndustries(facets.industries);
      else {
        fetch(`/api/screener/facets?sector=${encodeURIComponent(value)}`)
          .then((res) => (res.ok ? res.json() : null))
          .then((f: ScreenerFacets | null) => setIndustries(f?.industries ?? []))
          .catch(() => setIndustries([]));
      }
    }

    cancelPending();
    // Dropdowns apply at once; text and number inputs wait for a pause in typing.
    const delay = key === 'sector' || key === 'industry' ? 0 : DEBOUNCE_MS;
    timer.current = setTimeout(() => applyDraft(next), delay);
  };

  const syncDraft = (filters: ScreenerFilters) => {
    setDraft(draftFromFilters(filters));
    setIndustries(facets.industries);
  };

  const handleClear = () => {
    cancelPending();
    setActivePresetId(null);
    setError(null);
    syncDraft(CLEARED);
    void load(CLEARED, 0, pageSize);
  };

  const handlePreset = (preset: ScreenerPreset) => {
    cancelPending();
    setActivePresetId(preset.id);
    setError(null);
    syncDraft(preset.filters);
    void load(preset.filters, 0, pageSize);
  };

  const handleSort = (key: RangeFieldKey) => {
    cancelPending();
    const dir = applied.sort_by === key && (applied.order ?? 'desc') === 'desc' ? 'asc' : 'desc';
    void load({ ...applied, sort_by: key, order: dir }, 0, pageSize);
  };

  const handleSortValue = (value: string) => {
    const parsed = parseSortValue(value);
    if (!parsed) return;
    cancelPending();
    void load({ ...applied, ...parsed }, 0, pageSize);
  };

  const handleRemoveChip = (keys: (keyof ScreenerFilters)[]) => {
    cancelPending();
    const next = withoutKeys(applied, keys);
    setActivePresetId(null);
    setError(null);
    syncDraft(next);
    void load(next, 0, pageSize);
  };

  const chips = describeFilters(applied);
  const highlighted = highlightedKeys(applied);
  // The export ignores paging, so it carries the filters + sort only.
  const csvHref = `/api/screener/export?${buildScreenerQuery(applied)}`;
  const lastPage = pageCountFor(data.total, pageSize) - 1;

  return (
    <>
      <ScreenerToolbar
        draft={draft}
        facets={facets}
        industries={industries}
        chips={chips}
        activePresetId={activePresetId}
        fundamentalsReady={fundamentalsReady}
        loading={loading}
        error={error}
        onChange={handleChange}
        onPreset={handlePreset}
        onRemoveChip={handleRemoveChip}
        onClear={handleClear}
      />

      <ScreenerResults
        rows={data.rows}
        total={data.total}
        page={Math.min(page, lastPage)}
        pageSize={pageSize}
        sort={sortOf(applied)}
        highlighted={highlighted}
        cardMetrics={cardMetricKeys(applied)}
        loading={loading}
        csvHref={csvHref}
        onSort={handleSort}
        onPageChange={(next) => void load(applied, next, pageSize)}
        onPageSizeChange={(size) => void load(applied, 0, size)}
        onClear={handleClear}
      />

      <MobileActionBar
        activeCount={activeFilterCount(applied)}
        sortValue={sortValueOf(applied)}
        onOpenFilters={() => setSheetOpen(true)}
        onSortChange={handleSortValue}
      />
      <FilterSheet
        open={sheetOpen}
        draft={draft}
        facets={facets}
        industries={industries}
        total={data.total}
        loading={loading}
        error={error}
        onChange={handleChange}
        onClear={handleClear}
        onClose={() => setSheetOpen(false)}
      />
    </>
  );
}

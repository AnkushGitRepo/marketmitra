'use client';

import { useCallback, useRef, useState } from 'react';
import {
  buildScreenerQuery,
  type ScreenerFacets,
  type ScreenerFilters,
  type ScreenerResultRow,
} from '@/lib/dashboard/screenerSchema';
import type { RangeFieldKey } from '@/lib/dashboard/screenerSchema';
import {
  buildFilters,
  describeFilters,
  draftFromFilters,
  withoutKeys,
  type Draft,
  type RangeKey,
} from '@/lib/screener/draft';
import type { ScreenerPreset } from '@/lib/screener/presets';
import { ScreenerFilterPanel } from './ScreenerFilterPanel';
import { ScreenerResults, type SortState } from './ScreenerResults';
import { pageCountFor } from './pageMath';
import styles from './page.module.css';

interface ScreenerPageClientProps {
  initialResults: ScreenerResultRow[];
  initialTotal: number;
  initialFilters: ScreenerFilters;
  initialPage: number;
  initialPageSize: number;
  facets: ScreenerFacets;
  fundamentalsReady: boolean;
}

const PAGE_PATH = '/dashboard/screener';
// What "Clear all" returns to: every company, biggest first.
const CLEARED: ScreenerFilters = { sort_by: 'market_cap' };

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
  // Only the newest request may update the screen (fast clicks, slow network).
  const requestId = useRef(0);

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
      setApplied(filters);
      setPage(nextPage);
      setPageSize(nextSize);
      // Keep the URL shareable / reload-safe without a server round trip.
      window.history.replaceState(null, '', `${PAGE_PATH}?${query}`);
    } catch {
      if (id === requestId.current)
        setError('Could not reach the screener — try again in a moment.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  const handleChange = (key: RangeKey | 'sector' | 'industry' | 'q', value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value, ...(key === 'sector' ? { industry: '' } : {}) }));
    if (key !== 'sector') return;
    // Industry options follow the chosen sector.
    if (!value) {
      setIndustries(facets.industries);
      return;
    }
    fetch(`/api/screener/facets?sector=${encodeURIComponent(value)}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((next: ScreenerFacets | null) => setIndustries(next?.industries ?? []))
      .catch(() => setIndustries([]));
  };

  const syncDraft = (filters: ScreenerFilters) => {
    setDraft(draftFromFilters(filters));
    setIndustries(facets.industries);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const built = buildFilters(draft, applied);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    setActivePresetId(null);
    void load(built.filters, 0, pageSize);
  };

  const handleClear = () => {
    setActivePresetId(null);
    syncDraft(CLEARED);
    void load(CLEARED, 0, pageSize);
  };

  const handlePreset = (preset: ScreenerPreset) => {
    setActivePresetId(preset.id);
    syncDraft(preset.filters);
    void load(preset.filters, 0, pageSize);
  };

  const handleSort = (key: RangeFieldKey) => {
    const dir = applied.sort_by === key && (applied.order ?? 'desc') === 'desc' ? 'asc' : 'desc';
    void load({ ...applied, sort_by: key, order: dir }, 0, pageSize);
  };

  const handleRemoveChip = (keys: (keyof ScreenerFilters)[]) => {
    const next = withoutKeys(applied, keys);
    setActivePresetId(null);
    syncDraft(next);
    void load(next, 0, pageSize);
  };

  const chips = describeFilters(applied);
  // The export ignores paging, so it carries the filters + sort only.
  const csvHref = `/api/screener/export?${buildScreenerQuery(applied)}`;
  const lastPage = pageCountFor(data.total, pageSize) - 1;

  return (
    <>
      <ScreenerFilterPanel
        draft={draft}
        facets={facets}
        industries={industries}
        error={error}
        loading={loading}
        fundamentalsReady={fundamentalsReady}
        activePresetId={activePresetId}
        onChange={handleChange}
        onSubmit={handleSubmit}
        onReset={handleClear}
        onPreset={handlePreset}
      />

      {chips.length > 0 && (
        <div className={styles.activeChips} aria-label="Applied filters">
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className={styles.activeChip}
              onClick={() => handleRemoveChip(chip.keys)}
              aria-label={`Remove filter ${chip.label}`}
            >
              {chip.label} <span aria-hidden="true">×</span>
            </button>
          ))}
          <button type="button" className={styles.clearLink} onClick={handleClear}>
            Clear all
          </button>
        </div>
      )}

      <ScreenerResults
        rows={data.rows}
        total={data.total}
        page={Math.min(page, lastPage)}
        pageSize={pageSize}
        sort={sortOf(applied)}
        loading={loading}
        csvHref={csvHref}
        onSort={handleSort}
        onPageChange={(next) => void load(applied, next, pageSize)}
        onPageSizeChange={(size) => void load(applied, 0, size)}
        onClear={handleClear}
      />
    </>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  SCREENER_RANGE_FIELDS,
  buildScreenerQuery,
  type RangeFieldKey,
  type ScreenerFilters,
  type ScreenerResultRow,
} from '@/lib/dashboard/screenerSchema';
import styles from './page.module.css';

interface ScreenerPageClientProps {
  initialResults: ScreenerResultRow[];
  initialFilters: ScreenerFilters;
  sectors: string[];
}

type RangeSuffix = 'min' | 'max';
type RangeKey = `${RangeFieldKey}_min` | `${RangeFieldKey}_max`;

function rangeDraftKey(key: RangeFieldKey, suffix: RangeSuffix): RangeKey {
  return `${key}_${suffix}`;
}

type Draft = Partial<Record<RangeKey, string>> & { sector: string };

function draftFromFilters(filters: ScreenerFilters): Draft {
  const draft = { sector: filters.sector ?? '' } as Draft;
  for (const field of SCREENER_RANGE_FIELDS) {
    const minKey = rangeDraftKey(field.key, 'min');
    const maxKey = rangeDraftKey(field.key, 'max');
    draft[minKey] = filters[minKey] !== undefined ? String(filters[minKey]) : '';
    draft[maxKey] = filters[maxKey] !== undefined ? String(filters[maxKey]) : '';
  }
  return draft;
}

type BuiltFilters = { ok: true; filters: ScreenerFilters } | { ok: false; error: string };

function buildFilters(draft: Draft): BuiltFilters {
  const filters: ScreenerFilters = {};
  for (const field of SCREENER_RANGE_FIELDS) {
    const minRaw = draft[rangeDraftKey(field.key, 'min')]?.trim();
    const maxRaw = draft[rangeDraftKey(field.key, 'max')]?.trim();
    let min: number | undefined;
    let max: number | undefined;
    if (minRaw) {
      min = Number(minRaw);
      if (!Number.isFinite(min))
        return { ok: false, error: `${field.label}: enter a valid minimum.` };
    }
    if (maxRaw) {
      max = Number(maxRaw);
      if (!Number.isFinite(max))
        return { ok: false, error: `${field.label}: enter a valid maximum.` };
    }
    if (min !== undefined && max !== undefined && min > max) {
      return { ok: false, error: `${field.label}: minimum can't exceed maximum.` };
    }
    if (min !== undefined) filters[rangeDraftKey(field.key, 'min')] = min;
    if (max !== undefined) filters[rangeDraftKey(field.key, 'max')] = max;
  }
  if (draft.sector) filters.sector = draft.sector;
  return { ok: true, filters };
}

type Column = {
  key: keyof ScreenerResultRow;
  label: string;
  format: (row: ScreenerResultRow) => string;
};

function formatNum(value: number | null, opts: { suffix?: string; digits?: number } = {}): string {
  if (value === null) return '—';
  const { suffix = '', digits = 2 } = opts;
  return `${value.toLocaleString('en-IN', { maximumFractionDigits: digits })}${suffix}`;
}

const COLUMNS: Column[] = [
  {
    key: 'sector',
    label: 'Sector',
    format: (r) => r.sector ?? '—',
  },
  {
    key: 'market_cap',
    label: 'Market cap',
    format: (r) => (r.market_cap === null ? '—' : `₹${formatNum(r.market_cap, { digits: 0 })} Cr`),
  },
  {
    key: 'current_price',
    label: 'Price',
    format: (r) => (r.current_price === null ? '—' : `₹${formatNum(r.current_price)}`),
  },
  { key: 'pe', label: 'P/E', format: (r) => formatNum(r.pe, { suffix: 'x' }) },
  { key: 'pb', label: 'P/B', format: (r) => formatNum(r.pb, { suffix: 'x' }) },
  { key: 'roe', label: 'ROE', format: (r) => formatNum(r.roe, { suffix: '%' }) },
  { key: 'roce', label: 'ROCE', format: (r) => formatNum(r.roce, { suffix: '%' }) },
  {
    key: 'dividend_yield',
    label: 'Div yield',
    format: (r) => formatNum(r.dividend_yield, { suffix: '%' }),
  },
  {
    key: 'debt_to_equity',
    label: 'Debt/Equity',
    format: (r) => formatNum(r.debt_to_equity, { suffix: 'x' }),
  },
  {
    key: 'sales_growth_3y_cagr',
    label: 'Sales growth (3y)',
    format: (r) => formatNum(r.sales_growth_3y_cagr, { suffix: '%' }),
  },
  {
    key: 'profit_growth_3y_cagr',
    label: 'Profit growth (3y)',
    format: (r) => formatNum(r.profit_growth_3y_cagr, { suffix: '%' }),
  },
];

type SortDir = 'asc' | 'desc';
type SortableKey = RangeFieldKey;
const SORTABLE = new Set<string>(SCREENER_RANGE_FIELDS.map((f) => f.key));
// The API returns at most this many rows per request.
const RESULT_LIMIT = 100;

export function ScreenerPageClient({
  initialResults,
  initialFilters,
  sectors,
}: ScreenerPageClientProps) {
  const [draft, setDraft] = useState<Draft>(() => draftFromFilters(initialFilters));
  const [results, setResults] = useState<ScreenerResultRow[]>(initialResults);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sort, setSort] = useState<{ key: SortableKey; dir: SortDir } | null>(() =>
    initialFilters.sort_by
      ? { key: initialFilters.sort_by, dir: initialFilters.order ?? 'desc' }
      : null,
  );
  const [appliedFilters, setAppliedFilters] = useState<ScreenerFilters>(initialFilters);

  const set = (key: RangeKey | 'sector', value: string) =>
    setDraft((prev) => ({ ...prev, [key]: value }));

  const applyFilters = async (filters: ScreenerFilters) => {
    setLoading(true);
    setError(null);
    try {
      const query = buildScreenerQuery(filters);
      const response = await fetch(query ? `/api/screener?${query}` : '/api/screener');
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        setError(payload?.message ?? 'Could not run that screen.');
        return;
      }
      setResults(await response.json());
      setAppliedFilters(filters);
      setSort(filters.sort_by ? { key: filters.sort_by, dir: filters.order ?? 'desc' } : null);
    } catch {
      setError('Could not reach the screener — try again in a moment.');
    } finally {
      setLoading(false);
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    const built = buildFilters(draft);
    if (!built.ok) {
      setError(built.error);
      return;
    }
    await applyFilters({
      ...built.filters,
      ...(sort ? { sort_by: sort.key, order: sort.dir } : {}),
    });
  };

  const handleReset = async () => {
    setDraft(draftFromFilters(initialFilters));
    await applyFilters(initialFilters);
  };

  // Sorting is done by the API over the whole matching set (not just the
  // rows on screen), so a click re-runs the applied filters with a new order.
  const toggleSort = (key: keyof ScreenerResultRow) => {
    if (!SORTABLE.has(key)) return;
    const sortKey = key as SortableKey;
    const dir: SortDir = sort?.key === sortKey && sort.dir === 'desc' ? 'asc' : 'desc';
    void applyFilters({ ...appliedFilters, sort_by: sortKey, order: dir });
  };

  const sortedResults = results;

  return (
    <>
      <form className={`${styles.formCard}`} onSubmit={handleApply}>
        <p className={styles.formCardTitle}>Filters</p>
        <div className={styles.formGrid}>
          {SCREENER_RANGE_FIELDS.map((field) => (
            <div key={field.key} className={styles.field}>
              <span className={styles.fieldLabel}>
                {field.label}
                {field.unit ? ` (${field.unit})` : ''}
              </span>
              <div className={styles.rangeInputs}>
                <input
                  className={styles.input}
                  type="number"
                  step="any"
                  placeholder="Min"
                  value={draft[rangeDraftKey(field.key, 'min')] ?? ''}
                  onChange={(e) => set(rangeDraftKey(field.key, 'min'), e.target.value)}
                />
                <span className={styles.rangeSep}>–</span>
                <input
                  className={styles.input}
                  type="number"
                  step="any"
                  placeholder="Max"
                  value={draft[rangeDraftKey(field.key, 'max')] ?? ''}
                  onChange={(e) => set(rangeDraftKey(field.key, 'max'), e.target.value)}
                />
              </div>
            </div>
          ))}

          <label className={styles.field}>
            <span className={styles.fieldLabel}>Sector</span>
            <select
              className={styles.select}
              value={draft.sector}
              onChange={(e) => set('sector', e.target.value)}
            >
              <option value="">All sectors</option>
              {sectors.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        {error && <p className={styles.formError}>{error}</p>}

        <div className={styles.formActions}>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handleReset}
            disabled={loading}
          >
            Reset
          </button>
          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading ? 'Screening…' : 'Apply filters'}
          </button>
        </div>
      </form>

      {sortedResults.length === 0 ? (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>No companies match these filters</p>
          <p className={styles.emptyText}>Try widening a range or clearing the sector filter.</p>
          <button
            type="button"
            className={styles.btnSecondary}
            onClick={handleReset}
            style={{ marginTop: 16 }}
          >
            Reset filters
          </button>
        </div>
      ) : (
        <>
          <p className={styles.introNote} data-testid="screener-count">
            {sortedResults.length >= RESULT_LIMIT
              ? `Showing the top ${RESULT_LIMIT} matches — narrow the filters to see others.`
              : `${sortedResults.length} ${sortedResults.length === 1 ? 'company matches' : 'companies match'}.`}
          </p>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={`${styles.th} ${styles.thLeft}`}>Company</th>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={`${styles.th} ${styles.thRight} ${SORTABLE.has(col.key) ? styles.thSortable : ''}`}
                      aria-sort={
                        sort?.key === col.key
                          ? sort.dir === 'desc'
                            ? 'descending'
                            : 'ascending'
                          : undefined
                      }
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.label}
                      {sort?.key === col.key ? (sort.dir === 'desc' ? ' ↓' : ' ↑') : ''}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedResults.map((row) => (
                  <tr key={row.symbol} className={styles.row}>
                    <td className={styles.rowLabel} style={{ textAlign: 'left' }}>
                      <Link
                        href={`/dashboard/stock/${encodeURIComponent(row.symbol)}`}
                        className={styles.rowLink}
                      >
                        {row.name}
                        <span className={styles.rowSymbol}> · {row.symbol}</span>
                      </Link>
                    </td>
                    {COLUMNS.map((col) => (
                      <td key={col.key} className={styles.rowCell}>
                        {col.format(row)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

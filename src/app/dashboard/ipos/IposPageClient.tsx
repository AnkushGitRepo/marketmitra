'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { Ipo } from '@/lib/dashboard/iposApi';
import type { IpoWatchParams } from '@/lib/alerts/types';
import {
  filterIpos,
  ipoQueryString,
  IPO_PHASES,
  paginate,
  parseIpoQuery,
  PHASE_LABEL,
  phaseCounts,
  TYPE_LABEL,
  typeCounts,
  type IpoQuery,
} from '@/lib/dashboard/ipoFilters';
import { IpoPagination } from './IpoPagination';
import { IpoRow } from './IpoRow';
import styles from './page.module.css';

interface IposPageClientProps {
  ipos: Ipo[];
  /** Today's date in India (YYYY-MM-DD), computed on the server. */
  today: string;
  initialWatch: IpoWatchParams | null;
  aiKeyAvailable: boolean;
}

const DEFAULT_WATCH: IpoWatchParams = {
  triggers: { opens: true, lastDay: true, allotmentListing: false },
  ipoType: 'all',
};

export function IposPageClient({ ipos, today, initialWatch, aiKeyAvailable }: IposPageClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [watchOpen, setWatchOpen] = useState(false);
  const [watch, setWatch] = useState<IpoWatchParams>(initialWatch ?? DEFAULT_WATCH);
  const [saving, setSaving] = useState(false);
  const watchOn = initialWatch !== null;

  // The URL is the source of truth for the view, so a filtered page can be
  // shared or reloaded. State mirrors it; history.replaceState keeps the address
  // bar in sync without a server round-trip (the data is already on the page).
  const [query, setQuery] = useState<IpoQuery>(() => parseIpoQuery(searchParams));
  const update = (next: Partial<IpoQuery>) => {
    // Changing a filter or the page size always returns to the first page.
    const resetsPage = 'phase' in next || 'type' in next || 'pageSize' in next;
    const merged: IpoQuery = { ...query, ...(resetsPage ? { page: 0 } : {}), ...next };
    setQuery(merged);
    const qs = ipoQueryString(merged);
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  };

  const filtered = useMemo(
    () => filterIpos(ipos, { phase: query.phase, type: query.type }, today),
    [ipos, query.phase, query.type, today],
  );
  const phases = useMemo(() => phaseCounts(ipos, query.type, today), [ipos, query.type, today]);
  const types = useMemo(() => typeCounts(ipos, query.phase, today), [ipos, query.phase, today]);
  const paged = paginate(filtered, query.page, query.pageSize);
  const filtering = query.phase !== 'all' || query.type !== 'all';

  const saveWatch = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'ipo_watch', params: watch }),
      });
      if (res.ok) {
        setWatchOpen(false);
        router.refresh();
      }
    } finally {
      setSaving(false);
    }
  };

  const setTrigger = (key: keyof IpoWatchParams['triggers'], value: boolean) =>
    setWatch((w) => ({ ...w, triggers: { ...w.triggers, [key]: value } }));

  return (
    <>
      <div className={styles.watchBar}>
        <button
          type="button"
          className={`${styles.watchToggle} ${watchOn ? styles.watchToggleOn : ''}`}
          onClick={() => setWatchOpen((v) => !v)}
        >
          {watchOn ? '🔔 IPO alerts on' : 'Notify me about IPOs'}
        </button>
      </div>

      {watchOpen && (
        <div className={styles.watchPanel}>
          <p className={styles.watchPanelTitle}>Notify me when an IPO…</p>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={watch.triggers.opens}
              onChange={(e) => setTrigger('opens', e.target.checked)}
            />
            opens for subscription
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={watch.triggers.lastDay}
              onChange={(e) => setTrigger('lastDay', e.target.checked)}
            />
            is on its last day to apply
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={watch.triggers.allotmentListing}
              onChange={(e) => setTrigger('allotmentListing', e.target.checked)}
            />
            reaches allotment / listing day
          </label>
          <label className={styles.check}>
            <input
              type="checkbox"
              checked={watch.ipoType === 'mainboard'}
              onChange={(e) => setWatch((w) => ({ ...w, ipoType: e.target.checked ? 'mainboard' : 'all' }))}
            />
            mainboard IPOs only
          </label>
          <div className={styles.watchActions}>
            <button type="button" className={styles.btnSmall} onClick={saveWatch} disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {ipos.length === 0 ? (
        <div className={styles.emptyCard}>
          <p className={styles.emptyTitle}>No IPO data right now</p>
          <p className={styles.emptyText}>
            The tracker refreshes periodically — check back shortly.
          </p>
        </div>
      ) : (
        <>
          <div className={styles.filters} role="group" aria-label="Filter IPOs">
            <div className={styles.filterRow}>
              <FilterChip label="All" count={phases.all} active={query.phase === 'all'} onClick={() => update({ phase: 'all' })} />
              {IPO_PHASES.map((p) => (
                <FilterChip
                  key={p}
                  label={PHASE_LABEL[p]}
                  count={phases[p]}
                  active={query.phase === p}
                  onClick={() => update({ phase: p })}
                />
              ))}
            </div>
            <div className={styles.filterRow}>
              {(['all', 'mainboard', 'sme'] as const).map((t) => (
                <FilterChip
                  key={t}
                  label={TYPE_LABEL[t]}
                  count={types[t]}
                  active={query.type === t}
                  onClick={() => update({ type: t })}
                />
              ))}
            </div>
          </div>

          {paged.total === 0 ? (
            <div className={styles.emptyCard}>
              <p className={styles.emptyTitle}>No IPOs match these filters</p>
              <p className={styles.emptyText}>
                {filtering ? 'Try a different status or type, or clear the filters.' : 'Nothing to show right now.'}
              </p>
              {filtering && (
                <button type="button" className={styles.btnSmall} onClick={() => update({ phase: 'all', type: 'all' })}>
                  Clear filters
                </button>
              )}
            </div>
          ) : (
            <>
              <ul className={styles.ipoList}>
                {paged.items.map((ipo) => (
                  <IpoRow key={ipo.slug} ipo={ipo} today={today} aiKeyAvailable={aiKeyAvailable} />
                ))}
              </ul>
              <IpoPagination
                page={paged.page}
                pageSize={query.pageSize}
                total={paged.total}
                onPageChange={(page) => update({ page })}
                onPageSizeChange={(pageSize) => update({ pageSize })}
              />
            </>
          )}
        </>
      )}
    </>
  );
}

function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.chip} ${active ? styles.chipActive : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {label} <span className={styles.chipCount}>{count}</span>
    </button>
  );
}

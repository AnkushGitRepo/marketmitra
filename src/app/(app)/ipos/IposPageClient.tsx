'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { Ipo } from '@/lib/dashboard/iposApi';
import type { IpoWatchParams } from '@/lib/alerts/types';
import {
  defaultGroup,
  filterIpos,
  groupCounts,
  ipoQueryString,
  paginate,
  parseIpoQuery,
  typeCounts,
  type IpoQuery,
} from '@/lib/dashboard/ipoFilters';
import { IpoCard } from '@/components/ipos/IpoCard';
import { IpoFilterBar } from '@/components/ipos/IpoFilterBar';
import { IpoPagination } from './IpoPagination';
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
    // Changing a tab, the type or the page size always returns to the first page.
    const resetsPage = 'group' in next || 'type' in next || 'pageSize' in next;
    const merged: IpoQuery = { ...query, ...(resetsPage ? { page: 0 } : {}), ...next };
    setQuery(merged);
    const qs = ipoQueryString(merged);
    window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  };

  const groups = useMemo(() => groupCounts(ipos, query.type, today), [ipos, query.type, today]);
  // Open on the first tab that has IPOs, so the page is never an empty "Live" list while issues exist elsewhere.
  const group = query.group ?? defaultGroup(groups);
  const types = useMemo(() => typeCounts(ipos, group, today), [ipos, group, today]);
  const filtered = useMemo(() => filterIpos(ipos, { group, type: query.type }, today), [ipos, group, query.type, today]);
  const paged = paginate(filtered, query.page, query.pageSize);

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
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>IPOs</p>
          <h1 className={styles.h1}>IPO tracker</h1>
        </div>
        <button
          type="button"
          className={`${styles.watchToggle} ${watchOn ? styles.watchToggleOn : ''}`}
          aria-expanded={watchOpen}
          onClick={() => setWatchOpen((v) => !v)}
        >
          {watchOn ? '🔔 IPO alerts on' : '🔔 Notify me'}
        </button>
      </div>
      <p className={styles.introNote}>
        Calendar, subscription, and grey-market premium for mainboard &amp; SME IPOs. GMP is an{' '}
        <em>unofficial grey-market estimate</em> compiled by a third-party tracker: not from any exchange, and not a
        prediction.
      </p>

      {watchOpen && (
        <div className={styles.watchPanel}>
          <p className={styles.watchPanelTitle}>Notify me when an IPO…</p>
          <label className={styles.check}>
            <input type="checkbox" checked={watch.triggers.opens} onChange={(e) => setTrigger('opens', e.target.checked)} />
            opens for subscription
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={watch.triggers.lastDay} onChange={(e) => setTrigger('lastDay', e.target.checked)} />
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
          <p className={styles.emptyText}>The tracker refreshes periodically. Check back shortly.</p>
        </div>
      ) : (
        <>
          <IpoFilterBar
            group={group}
            type={query.type}
            groupCounts={groups}
            typeCounts={types}
            onGroup={(g) => update({ group: g })}
            onType={(t) => update({ type: t })}
          />

          {paged.total === 0 ? (
            <div className={styles.emptyCard}>
              <p className={styles.emptyTitle}>No IPOs here</p>
              <p className={styles.emptyText}>
                {query.type !== 'all' ? 'Try a different type or tab.' : 'Nothing to show in this tab right now.'}
              </p>
              {query.type !== 'all' && (
                <button type="button" className={styles.btnSmall} onClick={() => update({ type: 'all' })}>
                  Show all types
                </button>
              )}
            </div>
          ) : (
            <>
              <ul className={styles.list}>
                {paged.items.map((ipo) => (
                  <IpoCard key={ipo.slug} ipo={ipo} today={today} aiKeyAvailable={aiKeyAvailable} />
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

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchResultsDropdown } from '@/components/dashboard-charts/SearchResultsDropdown';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import { WatchlistNameDialog } from '@/components/watchlists/WatchlistNameDialog';
import type { SearchResultOut } from '@/lib/dashboard/fundamentalsApi';
import type { Quote } from '@/lib/dashboard/quotes';
import type { UserWishlist } from '@/lib/wishlists/userWishlists';
import { sortSymbols, withHoldingsList, type SortMode } from '@/lib/wishlists/view';
import { WatchlistRow } from './WatchlistRow';
import styles from './WatchlistPanel.module.css';

interface WatchlistPanelProps {
  /** Stored under the legacy `wishlists` name (documented API); shown to users as watchlists. */
  readonly watchlists: readonly UserWishlist[];
  /** symbol -> live quote. A symbol missing here still shows as a row, minus the price columns. */
  readonly quotes: Record<string, Quote>;
  /** symbol -> recent closes for the row sparkline (about a month; there is no intraday source). */
  readonly sparks: Record<string, readonly number[]>;
  /** The user's holdings; they form the managed "Holdings" list. */
  readonly holdings: readonly { symbol: string }[];
}

const SORT_LABEL: Record<SortMode, string> = { default: 'Added order', gain: 'Top gainers', loss: 'Top losers' };

const DEBOUNCE_MS = 250;

async function errorOf(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? fallback;
}

export function WatchlistPanel({ watchlists, quotes, sparks, holdings }: WatchlistPanelProps) {
  const router = useRouter();
  const lists = withHoldingsList(
    watchlists.map((w) => ({ id: w.id, name: w.name, symbols: w.symbols, managed: false })),
    holdings
  );
  const [activeId, setActiveId] = useState<string | null>(lists[0]?.id ?? null);
  const [dialog, setDialog] = useState<{ mode: 'create' } | { mode: 'rename'; target: { id: string; name: string } } | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [sort, setSort] = useState<SortMode>('default');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultOut[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const trimmedQuery = query.trim();

  useEffect(() => {
    // Nothing to fetch for an empty query (the display values below hide stale results).
    if (trimmedQuery.length === 0) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      setSearchLoading(true);
      fetch(`/api/search?q=${encodeURIComponent(trimmedQuery)}`, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : []))
        .then((data: SearchResultOut[]) => setResults(data.filter((r) => r.type === 'company')))
        .catch(() => {})
        .finally(() => setSearchLoading(false));
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [trimmedQuery]);

  const displayResults = trimmedQuery.length === 0 ? [] : results;
  const displayLoading = trimmedQuery.length === 0 ? false : searchLoading;

  // The server-component prop is the source of truth (refreshed after every mutation); fall back to the first list if the active one is gone.
  const active = lists.find((l) => l.id === activeId) ?? lists[0] ?? null;
  const userLists = lists.filter((l) => !l.managed);
  const shownSymbols = active ? sortSymbols(active.symbols, quotes, sort) : [];

  const submitDialog = async (name: string) => {
    if (!dialog) return;
    setBusy(true);
    setDialogError(null);
    try {
      if (dialog.mode === 'create') {
        const res = await fetch('/api/watchlists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        const data = (await res.json().catch(() => null)) as { data?: UserWishlist; error?: string } | null;
        if (!res.ok || !data?.data) {
          setDialogError(data?.error ?? 'Could not create the watchlist.');
          return;
        }
        setActiveId(data.data.id);
      } else {
        const res = await fetch(`/api/watchlists/${dialog.target.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        if (!res.ok) {
          setDialogError(await errorOf(res, 'Could not rename the watchlist.'));
          return;
        }
      }
      setDialog(null);
      router.refresh();
    } catch {
      setDialogError('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const openDialog = (next: NonNullable<typeof dialog>) => {
    setError(null);
    setDialogError(null);
    setDialog(next);
  };

  const deleteActive = async () => {
    if (!active) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/watchlists/${active.id}`, { method: 'DELETE' });
      if (res.ok) {
        setActiveId(null);
        setConfirmDelete(false);
        router.refresh();
      } else {
        setConfirmDelete(false);
        setError(await errorOf(res, 'Could not delete the watchlist.'));
      }
    } finally {
      setBusy(false);
    }
  };

  const addSymbol = async (result: SearchResultOut) => {
    if (!active) return;
    setQuery('');
    setResults([]);
    setError(null);
    const res = await fetch(`/api/watchlists/${active.id}/symbols`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: result.symbol }),
    });
    if (!res.ok) {
      setError(await errorOf(res, 'Could not add that stock.'));
      return;
    }
    router.refresh();
  };

  const removeSymbol = async (symbol: string) => {
    if (!active) return;
    const res = await fetch(`/api/watchlists/${active.id}/symbols/${encodeURIComponent(symbol)}`, { method: 'DELETE' });
    if (res.ok) router.refresh();
    else setError(await errorOf(res, `Could not remove ${symbol}.`));
  };

  return (
    <section className={styles.panel} aria-label="Watchlists">
      <div className={styles.header}>
        <h2 className={styles.title}>Watchlists</h2>
        {active && !active.managed && (
          <div className={styles.manage}>
            <button type="button" className={styles.linkButton} onClick={() => openDialog({ mode: 'rename', target: { id: active.id, name: active.name } })}>
              Rename
            </button>
            <span className={styles.divider} aria-hidden="true" />
            <button type="button" className={styles.dangerButton} disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          </div>
        )}
      </div>

      <div className={styles.tabs} role="tablist" aria-label="Your watchlists">
        {lists.map((w) => (
          <button
            key={w.id}
            type="button"
            role="tab"
            aria-selected={w.id === active?.id}
            className={`${styles.tab} ${w.id === active?.id ? styles.tabActive : ''}`}
            onClick={() => setActiveId(w.id)}
            onDoubleClick={w.managed ? undefined : () => openDialog({ mode: 'rename', target: { id: w.id, name: w.name } })}
            title={w.managed ? 'Follows your portfolio' : 'Double-click to rename'}
          >
            {w.name}
            <span className={styles.tabCount}>{w.symbols.length}</span>
          </button>
        ))}
        <button type="button" className={styles.newTab} onClick={() => openDialog({ mode: 'create' })}>
          + New Watchlist
        </button>
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {active ? (
        <>
          {active.symbols.length > 1 && (
            <div className={styles.sortRow}>
              <label className={styles.sortLabel} htmlFor="wl-sort">
                Sort
              </label>
              <select id="wl-sort" className={styles.sortSelect} value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
                {(Object.keys(SORT_LABEL) as SortMode[]).map((m) => (
                  <option key={m} value={m}>
                    {SORT_LABEL[m]}
                  </option>
                ))}
              </select>
            </div>
          )}
          {active.managed ? (
            <p className={styles.note}>Follows your portfolio automatically. Add or remove holdings on the Portfolio page.</p>
          ) : (
          <div className={styles.searchWrap}>
            <input
              className={styles.searchInput}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder={`+ Add symbol to ${active.name}…`}
              aria-label={`Add a symbol to ${active.name}`}
            />
            {searchFocused && (
              <SearchResultsDropdown results={displayResults} loading={displayLoading} onSelect={addSymbol} query={query} />
            )}
          </div>
          )}

          <div className={styles.rows}>
            {active.symbols.length === 0 && <p className={styles.emptyRows}>Nothing here yet. Add a symbol above.</p>}
            {shownSymbols.map((symbol) => (
              <WatchlistRow
                key={symbol}
                symbol={symbol}
                quote={quotes[symbol]}
                spark={sparks[symbol]}
                listName={active.name}
                onRemove={active.managed ? undefined : (s) => void removeSymbol(s)}
              />
            ))}
          </div>
          {active.symbols.length > 0 && <p className={styles.note}>Trend lines show the last month.</p>}
        </>
      ) : (
        (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No watchlists yet</p>
            <p className={styles.emptyText}>Create a watchlist and add any NSE stock to it: a sector, a set of names, anything on your radar.</p>
            <button type="button" className={styles.smallPrimary} onClick={() => openDialog({ mode: 'create' })}>
              Create your first watchlist
            </button>
          </div>
        )
      )}

      <WatchlistNameDialog
        open={dialog !== null}
        mode={dialog?.mode ?? 'create'}
        target={dialog?.mode === 'rename' ? dialog.target : undefined}
        existing={userLists}
        busy={busy}
        serverError={dialogError}
        onSubmit={(name) => void submitDialog(name)}
        onCancel={() => setDialog(null)}
      />

      <ConfirmDialog
        open={confirmDelete}
        title="Delete Watchlist?"
        message={`“${active?.name ?? ''}” and its ${active?.symbols.length ?? 0} symbols will be removed. This cannot be undone.`}
        confirmLabel="Delete Watchlist"
        busy={busy}
        onConfirm={() => void deleteActive()}
        onCancel={() => setConfirmDelete(false)}
      />
    </section>
  );
}

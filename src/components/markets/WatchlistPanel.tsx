'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchResultsDropdown } from '@/components/dashboard-charts/SearchResultsDropdown';
import { ConfirmDialog } from '@/components/common/ConfirmDialog';
import type { SearchResultOut } from '@/lib/dashboard/fundamentalsApi';
import type { Quote } from '@/lib/dashboard/quotes';
import type { UserWishlist } from '@/lib/wishlists/userWishlists';
import { WatchlistRow } from './WatchlistRow';
import styles from './WatchlistPanel.module.css';

interface WatchlistPanelProps {
  /** Stored under the legacy `wishlists` name (documented API); shown to users as watchlists. */
  readonly watchlists: readonly UserWishlist[];
  /** symbol -> live quote. A symbol missing here still shows as a row, minus the price columns. */
  readonly quotes: Record<string, Quote>;
  /** symbol -> recent closes for the row sparkline (about a month; there is no intraday source). */
  readonly sparks: Record<string, readonly number[]>;
}

const DEBOUNCE_MS = 250;

async function errorOf(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? fallback;
}

export function WatchlistPanel({ watchlists, quotes, sparks }: WatchlistPanelProps) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(watchlists[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
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
  const active = watchlists.find((w) => w.id === activeId) ?? watchlists[0] ?? null;

  const submitCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/watchlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = (await res.json().catch(() => null)) as { data?: UserWishlist; error?: string } | null;
      if (!res.ok || !data?.data) {
        setError(data?.error ?? 'Could not create the watchlist.');
        return;
      }
      setActiveId(data.data.id);
      setCreating(false);
      setNewName('');
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const submitRename = async (id: string) => {
    const name = renameValue.trim();
    setRenamingId(null);
    if (!name || name === watchlists.find((w) => w.id === id)?.name) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/watchlists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (res.ok) router.refresh();
      else setError(await errorOf(res, 'Could not rename the watchlist.'));
    } finally {
      setBusy(false);
    }
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
        {active && (
          <div className={styles.manage}>
            <button type="button" className={styles.linkButton} onClick={() => { setRenamingId(active.id); setRenameValue(active.name); }}>
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
        {watchlists.map((w) =>
          renamingId === w.id ? (
            <input
              key={w.id}
              autoFocus
              className={styles.renameInput}
              value={renameValue}
              maxLength={60}
              aria-label="Watchlist name"
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitRename(w.id);
                if (e.key === 'Escape') setRenamingId(null);
              }}
              onBlur={() => void submitRename(w.id)}
            />
          ) : (
            <button
              key={w.id}
              type="button"
              role="tab"
              aria-selected={w.id === active?.id}
              className={`${styles.tab} ${w.id === active?.id ? styles.tabActive : ''}`}
              onClick={() => setActiveId(w.id)}
              onDoubleClick={() => { setRenamingId(w.id); setRenameValue(w.name); }}
              title="Double-click to rename"
            >
              {w.name}
              <span className={styles.tabCount}>{w.symbols.length}</span>
            </button>
          )
        )}
        {creating ? (
          <span className={styles.createRow}>
            <input
              autoFocus
              className={styles.renameInput}
              value={newName}
              maxLength={60}
              placeholder="Watchlist name"
              aria-label="New watchlist name"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void submitCreate();
                if (e.key === 'Escape') setCreating(false);
              }}
            />
            <button type="button" className={styles.smallPrimary} disabled={busy || !newName.trim()} onClick={() => void submitCreate()}>
              Create
            </button>
            <button type="button" className={styles.linkButton} onClick={() => setCreating(false)}>
              Cancel
            </button>
          </span>
        ) : (
          <button type="button" className={styles.newTab} onClick={() => { setError(null); setCreating(true); }}>
            + New Watchlist
          </button>
        )}
      </div>

      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}

      {active ? (
        <>
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

          <div className={styles.rows}>
            {active.symbols.length === 0 && <p className={styles.emptyRows}>Nothing here yet. Add a symbol above.</p>}
            {active.symbols.map((symbol) => (
              <WatchlistRow
                key={symbol}
                symbol={symbol}
                quote={quotes[symbol]}
                spark={sparks[symbol]}
                listName={active.name}
                onRemove={(s) => void removeSymbol(s)}
              />
            ))}
          </div>
          {active.symbols.length > 0 && <p className={styles.note}>Trend lines show the last month.</p>}
        </>
      ) : (
        !creating && (
          <div className={styles.empty}>
            <p className={styles.emptyTitle}>No watchlists yet</p>
            <p className={styles.emptyText}>Create a watchlist and add any NSE stock to it: a sector, a set of names, anything on your radar.</p>
            <button type="button" className={styles.smallPrimary} onClick={() => setCreating(true)}>
              Create your first watchlist
            </button>
          </div>
        )
      )}

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

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { SearchResultOut } from '@/lib/dashboard/fundamentalsApi';
import type { Quote } from '@/lib/dashboard/quotes';
import type { UserWishlist } from '@/lib/wishlists/userWishlists';
import { CompanyLogo } from './CompanyLogo';
import { SearchResultsDropdown } from './SearchResultsDropdown';
import styles from './WishlistPanel.module.css';

interface WishlistPanelProps {
  wishlists: UserWishlist[];
  /** symbol -> live quote, for every symbol across every wishlist that
   * resolved to a real price. A symbol missing here (fundamentals-api
   * down, or the ticker just hasn't got a live price) still shows as a
   * row, minus the price/change columns. */
  quotes: Record<string, Quote>;
}

const DEBOUNCE_MS = 250;

export function WishlistPanel({ wishlists, quotes }: WishlistPanelProps) {
  const router = useRouter();
  const [activeId, setActiveId] = useState<string | null>(wishlists[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResultOut[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const trimmedQuery = query.trim();

  useEffect(() => {
    // Nothing to fetch for an empty query — mirrors useSymbolSearch's own
    // convention (see its comment) to avoid a setState-in-effect that would
    // otherwise fire back to empty on every keystroke.
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

  // `wishlists` is the source of truth (the server-component prop,
  // refreshed via router.refresh() after every mutation) — no local mirror
  // of it, so a deleted/renamed list is reflected the moment the prop
  // updates. Falls back to the first list if the previously-active one is
  // gone, computed at render time rather than synced in an effect.
  const active = wishlists.find((w) => w.id === activeId) ?? wishlists[0] ?? null;

  const startCreate = () => {
    setError(null);
    setCreating(true);
    setNewName('');
  };

  const submitCreate = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/wishlists', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = (await res.json().catch(() => null)) as { data?: UserWishlist; error?: string } | null;
      if (!res.ok || !data?.data) {
        setError(data?.error ?? 'Could not create the wishlist.');
        return;
      }
      setActiveId(data.data.id);
      setCreating(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  const startRename = (w: UserWishlist) => {
    setRenamingId(w.id);
    setRenameValue(w.name);
    setError(null);
  };

  const submitRename = async (id: string) => {
    if (!renameValue.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/wishlists/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (res.ok) {
        setRenamingId(null);
        router.refresh();
      } else {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? 'Could not rename the wishlist.');
      }
    } finally {
      setBusy(false);
    }
  };

  const removeWishlist = async (w: UserWishlist) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/wishlists/${w.id}`, { method: 'DELETE' });
      if (res.ok) {
        setActiveId(null);
        router.refresh();
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
    const res = await fetch(`/api/wishlists/${active.id}/symbols`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ symbol: result.symbol }),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? 'Could not add that stock.');
      return;
    }
    router.refresh();
  };

  const removeSymbol = async (symbol: string) => {
    if (!active) return;
    const res = await fetch(`/api/wishlists/${active.id}/symbols/${encodeURIComponent(symbol)}`, {
      method: 'DELETE',
    });
    if (res.ok) router.refresh();
  };

  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <p className={styles.title}>Your wishlists</p>
        {!creating && (
          <button type="button" className={styles.newBtn} onClick={startCreate}>
            + New wishlist
          </button>
        )}
      </div>

      {creating && (
        <div className={styles.createRow}>
          <input
            autoFocus
            className={styles.createInput}
            value={newName}
            maxLength={60}
            placeholder="e.g. IT majors, Watching for a dip…"
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitCreate()}
          />
          <button type="button" className={styles.smallBtnPrimary} disabled={busy || !newName.trim()} onClick={submitCreate}>
            Create
          </button>
          <button type="button" className={styles.smallBtn} disabled={busy} onClick={() => setCreating(false)}>
            Cancel
          </button>
        </div>
      )}

      {wishlists.length === 0 && !creating ? (
        <div className={styles.empty}>
          <p className={styles.emptyTitle}>No wishlists yet</p>
          <p className={styles.emptyText}>
            Create a wishlist and add any NSE stock to it — track a sector, a set of
            names you&rsquo;re watching, or anything else you want on your radar.
          </p>
          <button type="button" className={styles.smallBtnPrimary} onClick={startCreate}>
            Create your first wishlist
          </button>
        </div>
      ) : (
        <>
          <div className={styles.tabs}>
            {wishlists.map((w) => (
              <div key={w.id} className={styles.tabWrap}>
                {renamingId === w.id ? (
                  <div className={styles.renameRow}>
                    <input
                      autoFocus
                      className={styles.renameInput}
                      value={renameValue}
                      maxLength={60}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && submitRename(w.id)}
                      onBlur={() => submitRename(w.id)}
                    />
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`${styles.tab} ${w.id === active?.id ? styles.tabActive : ''}`}
                    onClick={() => setActiveId(w.id)}
                    onDoubleClick={() => startRename(w)}
                    title="Double-click to rename"
                  >
                    {w.name}
                    <span className={styles.tabCount}>{w.symbols.length}</span>
                  </button>
                )}
              </div>
            ))}
          </div>

          {active && (
            <div className={styles.activeBody}>
              <div className={styles.activeHead}>
                <div className={styles.searchWrap}>
                  <input
                    className={styles.searchInput}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onFocus={() => setSearchFocused(true)}
                    onBlur={() => setSearchFocused(false)}
                    placeholder="Add a stock — try RELIANCE or TCS"
                  />
                  {searchFocused && (
                    <SearchResultsDropdown results={displayResults} loading={displayLoading} onSelect={addSymbol} />
                  )}
                </div>
                <button type="button" className={styles.linkButton} onClick={() => startRename(active)}>
                  Rename
                </button>
                <button type="button" className={styles.linkButtonDanger} disabled={busy} onClick={() => removeWishlist(active)}>
                  Delete list
                </button>
              </div>

              {error && <p className={styles.error}>{error}</p>}

              <div className={styles.rows}>
                {active.symbols.length === 0 && (
                  <p className={styles.emptyRowsText}>Nothing here yet — search above to add a stock.</p>
                )}
                {active.symbols.map((symbol) => {
                  const q = quotes[symbol];
                  const up = q && q.changePct >= 0;
                  return (
                    <div key={symbol} className={styles.row}>
                      <button
                        type="button"
                        className={styles.rowMain}
                        onClick={() => router.push(`/dashboard/stock/${symbol.toLowerCase()}`)}
                      >
                        <div className={styles.avatar}>
                          <CompanyLogo symbol={symbol} size={20} />
                        </div>
                        <div className={styles.info}>
                          <p className={styles.name}>{q?.name ?? symbol}</p>
                          <p className={styles.ticker}>
                            {symbol} {q?.sector ? `· ${q.sector}` : ''}
                          </p>
                        </div>
                        <div className={styles.priceCol}>
                          {q ? (
                            <>
                              <p className={styles.price}>
                                ₹{q.price.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                              </p>
                              <p className={styles.chg} style={{ color: up ? 'var(--app-gain)' : 'var(--app-loss)' }}>
                                {up ? '+' : ''}
                                {q.changePct.toFixed(2)}%
                              </p>
                            </>
                          ) : (
                            <p className={styles.ticker}>No live price</p>
                          )}
                        </div>
                      </button>
                      <button
                        type="button"
                        className={styles.removeBtn}
                        aria-label={`Remove ${symbol} from ${active.name}`}
                        onClick={() => removeSymbol(symbol)}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { isHosted } from '@/lib/deployment-mode';
import { SearchResultsDropdown } from '@/components/dashboard-charts/SearchResultsDropdown';
import { useSymbolSearch } from '@/lib/dashboard/useSymbolSearch';
import { HostedUserBadge } from './HostedUserBadge';
import { NotificationBell } from './NotificationBell';
import styles from './AppHeader.module.css';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/portfolio', label: 'Portfolio' },
  { href: '/dashboard/markets', label: 'Markets' },
  { href: '/dashboard/screener', label: 'Screener' },
  { href: '/dashboard/alerts', label: 'Alerts' },
  { href: '/dashboard/news', label: 'News' },
  { href: '/dashboard/ipos', label: 'IPOs' },
  { href: '/dashboard/research', label: 'Research' },
  { href: '/dashboard/agents', label: 'Agents' },
  { href: '/dashboard/notes', label: 'Notes' },
  { href: '/dashboard/api', label: 'API' },
] as const;

interface AppHeaderProps {
  onToggleMask: () => void;
}

function isNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (pathname.startsWith(href)) return true;
  // The stock detail page reads as part of "Markets" — it's reached from
  // there and has no nav entry of its own.
  if (href === '/dashboard/markets' && pathname.startsWith('/dashboard/stock')) return true;
  return false;
}

export function AppHeader({ onToggleMask }: AppHeaderProps) {
  const pathname = usePathname();
  const { query, setQuery, results, loading, selectResult } = useSymbolSearch();
  const [focused, setFocused] = useState(false);

  const userBadge = isHosted() ? (
    <HostedUserBadge />
  ) : (
    <div className={styles.userBadge}>
      <div className={styles.userAvatar}>LU</div>
      <span className={styles.userName}>Local user</span>
    </div>
  );

  return (
    <>
      <header className={styles.headerDesktop} data-app-desktop>
        <div className={styles.headerInner}>
          <Link href="/dashboard" className={styles.brand}>
            <span className={styles.brandMark} />
            <span className={styles.brandName}>MarketMitra</span>
          </Link>

          <nav className={styles.nav}>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`${styles.navItem} ${isNavActive(pathname, item.href) ? styles.navItemActive : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className={styles.spacer} />

          <div className={styles.actions}>
            <div className={styles.searchWrap}>
              <div className={styles.search}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="7" cy="7" r="5" stroke="#A9B2B8" strokeWidth="1.6" />
                  <line x1="10.8" y1="10.8" x2="14.4" y2="14.4" stroke="#A9B2B8" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  placeholder="Search stocks or indices"
                  className={styles.searchInput}
                />
              </div>
              {focused && <SearchResultsDropdown results={results} loading={loading} onSelect={selectResult} />}
            </div>
            <NotificationBell />
            <Link href="/dashboard/settings" title="Settings" className={styles.iconButton}>
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="10" r="2.6" stroke="currentColor" strokeWidth="1.6" />
                <path
                  d="M10 2.5v2M10 15.5v2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M2.5 10h2M15.5 10h2M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                />
              </svg>
            </Link>
            <button onClick={onToggleMask} title="Hide values" className={styles.iconButton} type="button">
              ₹
            </button>
            {userBadge}
          </div>
        </div>
      </header>

      <header className={styles.headerMobile} data-app-mobile>
        <Link href="/dashboard" className={styles.brand}>
          <span className={styles.brandMarkSmall} />
          <span className={styles.brandNameSmall}>MarketMitra</span>
        </Link>
        <div className={styles.mobileActions}>
          <NotificationBell />
          <button onClick={onToggleMask} className={styles.iconButtonSmall} type="button">
            ₹
          </button>
        </div>
      </header>
    </>
  );
}

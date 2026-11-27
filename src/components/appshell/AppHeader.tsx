'use client';

import Link from 'next/link';
import { useState } from 'react';
import { isHosted } from '@/lib/deployment-mode';
import { SearchResultsDropdown } from '@/components/dashboard-charts/SearchResultsDropdown';
import { useSymbolSearch } from '@/lib/dashboard/useSymbolSearch';
import { Logo } from '@/components/landing/Logo';
import { AccountMenu } from './AccountMenu';
import { HostedUserBadge } from './HostedUserBadge';
import { SettingsIcon } from './NavIcons';
import { NotificationBell } from './NotificationBell';
import { NotificationsProvider } from './NotificationsProvider';
import { useFloatingTip } from './useFloatingTip';
import { SEARCH_INPUT_ATTR, useIsMac } from './useKeyboardShortcuts';
import styles from './AppHeader.module.css';

interface AppHeaderProps {
  onToggleMask: () => void;
}

/** How long the pointer rests on a header control before its tip shows. */
const TIP_DELAY_MS = 450;

export function AppHeader({ onToggleMask }: AppHeaderProps) {
  const { query, setQuery, results, loading, selectResult, activeIndex, handleKeyDown } = useSymbolSearch();
  const [focused, setFocused] = useState(false);
  const isMac = useIsMac();
  const { tip, tipProps } = useFloatingTip({ place: 'below', delayMs: TIP_DELAY_MS });

  const userBadge = isHosted() ? (
    <HostedUserBadge />
  ) : (
    <AccountMenu />
  );

  return (
    <NotificationsProvider>
      <header className={styles.headerDesktop} data-app-desktop>
        <div className={styles.headerInner}>
          <div className={styles.searchWrap}>
            <div className={styles.search} {...tipProps('Search', `Stocks, ISIN or indices (${isMac ? '⌘K' : 'Ctrl K'})`)}>
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="5" stroke="#A9B2B8" strokeWidth="1.6" />
                <line x1="10.8" y1="10.8" x2="14.4" y2="14.4" stroke="#A9B2B8" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label="Search stocks or indices"
                autoComplete="off"
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="Search stocks, ISIN or indices"
                className={styles.searchInput}
                {...{ [SEARCH_INPUT_ATTR]: '' }}
                aria-keyshortcuts={isMac ? 'Meta+K' : 'Control+K'}
              />
              {!focused && query === '' && (
                <kbd className={styles.shortcutHint} aria-hidden="true">
                  {isMac ? '⌘K' : 'Ctrl K'}
                </kbd>
              )}
            </div>
            {focused && (
              <SearchResultsDropdown
                results={results}
                loading={loading}
                onSelect={selectResult}
                activeIndex={activeIndex}
                query={query}
              />
            )}
          </div>

          <div className={styles.actions}>
            <span className={styles.tipWrap} {...tipProps('Notifications', 'Alerts and the morning brief')}>
              <NotificationBell />
            </span>
            <Link
              href="/settings"
              aria-label="Settings"
              className={styles.iconButton}
              {...tipProps('Settings', 'Your AI key, preferences and data')}
            >
              <SettingsIcon size={16} />
            </Link>
            <button
              onClick={onToggleMask}
              aria-label="Hide values"
              className={styles.iconButton}
              type="button"
              {...tipProps('Hide values', 'Masks the amounts on the page')}
            >
              ₹
            </button>
            {userBadge}
          </div>
        </div>
        {tip}
      </header>

      <header className={styles.headerMobile} data-app-mobile>
        <Link href="/dashboard" className={styles.brand}>
          <Logo size={22} showWordmark={false} />
          <span className={styles.brandNameSmall}>MarketMitra</span>
        </Link>
        <div className={styles.mobileActions}>
          <NotificationBell goTo="/alerts" />
          <button onClick={onToggleMask} className={styles.iconButtonSmall} type="button">
            ₹
          </button>
        </div>
      </header>
    </NotificationsProvider>
  );
}

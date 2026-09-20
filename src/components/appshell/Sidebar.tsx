'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSyncExternalStore } from 'react';
import { NAV_ITEMS, isNavActive } from './navItems';
import { NAV_ICONS } from './NavIcons';
import styles from './Sidebar.module.css';

const COLLAPSE_KEY = 'mm-sidebar-collapsed';

// useSyncExternalStore (not useState+useEffect) so reading localStorage
// can't produce a hydration-mismatch flash — same pattern as CookieNotice.
function subscribe(onStoreChange: () => void) {
  window.addEventListener('storage', onStoreChange);
  return () => window.removeEventListener('storage', onStoreChange);
}
function getSnapshot() {
  try {
    return localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}
function getServerSnapshot() {
  return false;
}

function ChevronIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleCollapsed = () => {
    try {
      const next = !collapsed;
      localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      window.dispatchEvent(new StorageEvent('storage', { key: COLLAPSE_KEY }));
    } catch {
      // Best-effort persistence only.
    }
  };

  return (
    <aside
      className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}
      data-app-sidebar
      aria-label="Main navigation"
    >
      <div className={styles.top}>
        <Link href="/dashboard" className={styles.brand}>
          <span className={styles.brandMark} />
          {!collapsed && <span className={styles.brandName}>MarketMitra</span>}
        </Link>
        <button
          onClick={toggleCollapsed}
          className={styles.collapseToggle}
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <span className={collapsed ? styles.chevronFlipped : ''}>
            <ChevronIcon />
          </span>
        </button>
      </div>

      <nav className={styles.nav}>
        {NAV_ITEMS.map((item) => {
          const Icon = NAV_ICONS[item.href];
          const active = isNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
              aria-current={active ? 'page' : undefined}
              title={collapsed ? item.label : undefined}
            >
              <span className={styles.navIcon}>
                <Icon />
              </span>
              {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useSyncExternalStore, type FocusEvent, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { buildNavSections, isNavActive } from './navItems';
import { NAV_ICONS, ResearchIcon } from './NavIcons';
import { shortcutHintFor } from '@/lib/shortcuts/shortcuts';
import { Logo } from '@/components/landing/Logo';
import styles from './Sidebar.module.css';

const COLLAPSE_KEY = 'mm-sidebar-collapsed';
/** Gap between a collapsed-sidebar icon and its tip, in px. */
const TIP_GAP_PX = 10;

interface SidebarTip {
  label: string;
  hint?: string;
  /** Viewport coordinates: the tip's left edge and vertical centre. */
  left: number;
  top: number;
}

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
      <path
        d="M10 3 5 8l5 5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function Sidebar({ advisorEnabled = false }: { advisorEnabled?: boolean }) {
  const pathname = usePathname();
  const sections = buildNavSections(advisorEnabled);
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // A collapsed sidebar shows only icons, so each gets a tip with its name (#269). The tip is drawn on the page, not inside the sidebar,
  // because the sidebar clips whatever sticks out of it.
  const [tip, setTip] = useState<SidebarTip | null>(null);
  const showTip = (
    e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>,
    label: string,
    hint?: string,
  ) => {
    if (!collapsed) return;
    // Hover only on a real pointer (on touch it would stick after a tap); focus only from the keyboard.
    if (
      e.type === 'focus'
        ? !e.currentTarget.matches(':focus-visible')
        : !window.matchMedia('(hover: hover)').matches
    )
      return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ label, hint, left: r.right + TIP_GAP_PX, top: r.top + r.height / 2 });
  };
  const hideTip = () => setTip(null);
  const tipHandlers = (label: string, hint?: string) => ({
    onMouseEnter: (e: MouseEvent<HTMLElement>) => showTip(e, label, hint),
    onFocus: (e: FocusEvent<HTMLElement>) => showTip(e, label, hint),
    onMouseLeave: hideTip,
    onBlur: hideTip,
  });

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
        <Link
          href="/dashboard"
          className={styles.brand}
          {...tipHandlers('MarketMitra', 'Go to the dashboard')}
        >
          <Logo size={26} showWordmark={false} />
          {!collapsed && <span className={styles.brandName}>MarketMitra</span>}
        </Link>
        <button
          onClick={toggleCollapsed}
          className={styles.collapseToggle}
          type="button"
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          {...tipHandlers('Expand sidebar')}
        >
          <span className={collapsed ? styles.chevronFlipped : ''}>
            <ChevronIcon />
          </span>
        </button>
      </div>

      <nav className={styles.nav}>
        {sections.map((section) => (
          <div
            key={section.title}
            className={`${styles.section} ${section.pinnedToBottom ? styles.sectionPinned : ''}`}
            role="group"
            aria-labelledby={`nav-section-${section.title}`}
          >
            <p
              id={`nav-section-${section.title}`}
              className={`${styles.sectionTitle} ${collapsed ? styles.sectionTitleCollapsed : ''}`}
            >
              <span className={styles.sectionTitleText}>{section.title}</span>
            </p>
            {section.items.map((item) => {
              const Icon = NAV_ICONS[item.href as keyof typeof NAV_ICONS] ?? ResearchIcon;
              const active = isNavActive(pathname, item.href);
              const hint = shortcutHintFor(item.href);
              // Expanded, the label is on screen already: only the shortcut is worth a (native) tooltip.
              const tooltip = !collapsed && hint ? `${item.label} — ${hint}` : undefined;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}
                  aria-current={active ? 'page' : undefined}
                  title={tooltip}
                  aria-label={collapsed ? item.label : undefined}
                  {...tipHandlers(item.label, hint ? `Shortcut: ${hint}` : undefined)}
                >
                  <span className={styles.navIcon}>
                    <Icon />
                  </span>
                  {!collapsed && <span className={styles.navLabel}>{item.label}</span>}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
      {tip &&
        createPortal(
          <span className={styles.tip} role="tooltip" style={{ left: tip.left, top: tip.top }}>
            <span className={styles.tipLabel}>{tip.label}</span>
            {tip.hint && <span className={styles.tipHint}>{tip.hint}</span>}
          </span>,
          document.body,
        )}
    </aside>
  );
}

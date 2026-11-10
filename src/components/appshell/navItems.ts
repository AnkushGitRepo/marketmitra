export interface NavItem {
  readonly href: string;
  readonly label: string;
}

export interface NavSection {
  readonly title: string;
  readonly items: readonly NavItem[];
  /** Rendered after a flexible spacer so the section sits at the sidebar's bottom edge. */
  readonly pinnedToBottom?: boolean;
}

// Shown only when the local-only Advisor is switched on (ADVISOR_MODE=enabled);
// kept out of the static sections so it can never appear by default.
export const ADVISOR_NAV_ITEM: NavItem = { href: '/dashboard/advisor', label: 'Advisor' };

// "Mitra activity" (/dashboard/mitra-activity) has no entry here: it is linked
// from the Agents page and highlights Agents while open (see isNavActive).
const OVERVIEW: NavSection = {
  title: 'Overview',
  items: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/dashboard/portfolio', label: 'Portfolio' },
  ],
};

const MARKETS: NavSection = {
  title: 'Markets',
  items: [
    { href: '/dashboard/markets', label: 'Markets' },
    { href: '/dashboard/screener', label: 'Screener' },
    { href: '/dashboard/ipos', label: 'IPOs' },
    { href: '/dashboard/research', label: 'Research' },
    { href: '/dashboard/news', label: 'News' },
  ],
};

const SETTINGS: NavSection = {
  title: 'Settings',
  items: [
    { href: '/dashboard/system', label: 'System' },
    { href: '/dashboard/api', label: 'API' },
  ],
  pinnedToBottom: true,
};

export function buildNavSections(advisorEnabled: boolean): readonly NavSection[] {
  const aiAndTools: NavSection = {
    title: 'AI & Tools',
    items: [
      { href: '/dashboard/agents', label: 'Agents' },
      ...(advisorEnabled ? [ADVISOR_NAV_ITEM] : []),
      { href: '/dashboard/alerts', label: 'Alerts' },
      { href: '/dashboard/notes', label: 'Notes' },
    ],
  };
  return [OVERVIEW, MARKETS, aiAndTools, SETTINGS];
}

export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (pathname.startsWith(href)) return true;
  // The stock detail page reads as part of "Markets" — it's reached from
  // there and has no nav entry of its own.
  if (href === '/dashboard/markets' && pathname.startsWith('/dashboard/stock')) return true;
  // Likewise Mitra activity is reached from the Agents page.
  if (href === '/dashboard/agents' && pathname.startsWith('/dashboard/mitra-activity')) return true;
  return false;
}

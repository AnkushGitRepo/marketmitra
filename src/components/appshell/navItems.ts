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
export const ADVISOR_NAV_ITEM: NavItem = { href: '/advisor', label: 'Advisor' };

// The System page (/system) is operator-only and deliberately has no nav entry; admins reach it from Settings.
// "Mitra activity" (/mitra-activity) has no entry here: it is linked
// from the Agents page and highlights Agents while open (see isNavActive).
const OVERVIEW: NavSection = {
  title: 'Overview',
  items: [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/portfolio', label: 'Portfolio' },
  ],
};

const MARKETS: NavSection = {
  title: 'Markets',
  items: [
    { href: '/markets', label: 'Markets' },
    { href: '/screener', label: 'Screener' },
    { href: '/ipos', label: 'IPOs' },
    { href: '/research', label: 'Research' },
    { href: '/news', label: 'News' },
  ],
};

const SETTINGS: NavSection = {
  title: 'Settings',
  items: [
    { href: '/settings', label: 'Settings' },
    { href: '/api-docs', label: 'API' },
  ],
  pinnedToBottom: true,
};

export function buildNavSections(advisorEnabled: boolean): readonly NavSection[] {
  const aiAndTools: NavSection = {
    title: 'AI & Tools',
    items: [
      { href: '/mitra', label: 'Mitra chat' },
      { href: '/agents', label: 'Agents' },
      ...(advisorEnabled ? [ADVISOR_NAV_ITEM] : []),
      { href: '/alerts', label: 'Alerts' },
      { href: '/notes', label: 'Notes' },
    ],
  };
  return [OVERVIEW, MARKETS, aiAndTools, SETTINGS];
}

export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  // Whole-segment match, so /mitra does not also light up for /mitra-activity.
  if (pathname === href || pathname.startsWith(`${href}/`)) return true;
  // The stock detail page reads as part of "Markets" — it's reached from
  // there and has no nav entry of its own.
  if (href === '/markets' && pathname.startsWith('/stock')) return true;
  // Likewise Mitra activity is reached from the Agents page.
  if (href === '/agents' && pathname.startsWith('/mitra-activity')) return true;
  return false;
}

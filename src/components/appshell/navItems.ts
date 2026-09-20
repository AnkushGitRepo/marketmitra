export const NAV_ITEMS = [
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

export function isNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  if (pathname.startsWith(href)) return true;
  // The stock detail page reads as part of "Markets" — it's reached from
  // there and has no nav entry of its own.
  if (href === '/dashboard/markets' && pathname.startsWith('/dashboard/stock')) return true;
  return false;
}

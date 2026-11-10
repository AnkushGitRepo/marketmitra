import { isNavActive, type NavItem } from './navItems';

// Mobile bottom navigation (below 760px): five slots, the rest of the routes live in the "More" sheet.
// The five slots are Dashboard, Portfolio, Mitra chat (centre), Markets and More.

export interface MoreSection {
  readonly title: string;
  readonly items: readonly NavItem[];
}

/** Routes housed in the More sheet, grouped like the desktop sidebar. Advisor only appears when it is enabled. */
export function buildMoreSections(advisorEnabled: boolean): readonly MoreSection[] {
  return [
    {
      title: 'Discovery',
      items: [
        { href: '/screener', label: 'Screener' },
        { href: '/ipos', label: 'IPOs' },
        { href: '/research', label: 'Research' },
        { href: '/news', label: 'News' },
      ],
    },
    {
      title: 'Tools & intelligence',
      items: [
        { href: '/agents', label: 'Agents' },
        ...(advisorEnabled ? [{ href: '/advisor', label: 'Advisor' }] : []),
        { href: '/alerts', label: 'Alerts' },
        { href: '/notes', label: 'Notes' },
      ],
    },
    {
      title: 'System & preferences',
      items: [
        // API keys live in Settings. /system is operator-only and has no entry here.
        { href: '/settings', label: 'Settings & API keys' },
        { href: '/status', label: 'System status' },
      ],
    },
  ];
}

/** True when the current page is one of the More sheet's routes, so the More tab shows as active. */
export function isMoreActive(pathname: string, advisorEnabled: boolean): boolean {
  return buildMoreSections(advisorEnabled)
    .flatMap((s) => s.items)
    .some((item) => (item.href === '/status' ? pathname === '/status' : isNavActive(pathname, item.href)));
}

export const DISMISS_DISTANCE_PX = 90;
export const DISMISS_FLICK_PX = 24;
export const DISMISS_FLICK_VELOCITY = 0.6; // px per ms

/** Drag-to-dismiss rule for the sheet: a long drag, or a short quick flick, closes it. Upward drags never do. */
export function shouldDismissSheet(dragDistancePx: number, velocityPxPerMs: number): boolean {
  if (dragDistancePx <= 0) return false;
  return dragDistancePx >= DISMISS_DISTANCE_PX || (dragDistancePx >= DISMISS_FLICK_PX && velocityPxPerMs >= DISMISS_FLICK_VELOCITY);
}

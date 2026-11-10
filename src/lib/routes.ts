// App pages live at the top level (`/portfolio`, not `/dashboard/portfolio`).
// `/` is the public landing page and `/dashboard` is the app home. This list is the
// single source of truth for auth protection checks and the legacy redirect table.

/** Top-level app pages (each is a folder under `src/app/(app)/`). */
export const APP_PAGE_SEGMENTS = [
  'portfolio',
  'markets',
  'screener',
  'ipos',
  'news',
  'research',
  'agents',
  'notes',
  'alerts',
  'mitra',
  'mitra-activity',
  'advisor',
  'settings',
  'system',
  'stock',
  'index',
] as const;

/** Pages whose URL changed name as well as prefix: `/dashboard/api` is now `/api-docs`. */
export const API_DOCS_PATH = '/api-docs';

export interface LegacyRedirect {
  readonly source: string;
  readonly destination: string;
  readonly permanent: true;
}

/** Old `/dashboard/<page>` URLs (alert emails, bookmarks, shared links) → new ones. Query strings are kept by Next. */
export function legacyDashboardRedirects(): LegacyRedirect[] {
  return [
    ...APP_PAGE_SEGMENTS.map((segment) => ({
      source: `/dashboard/${segment}/:path*`,
      destination: `/${segment}/:path*`,
      permanent: true as const,
    })),
    { source: '/dashboard/api/:path*', destination: `${API_DOCS_PATH}/:path*`, permanent: true },
  ];
}

// Groups the 86-endpoint OpenAPI spec into the five categories the reference page shows.

export const CATEGORY_ORDER = [
  'Market Data',
  'Watchlists & Screener',
  'Portfolio & Notes',
  'AI & Mitra Copilot',
  'System & Cron',
] as const;

export type ApiCategory = (typeof CATEGORY_ORDER)[number];

const TAG_CATEGORY: Readonly<Record<string, ApiCategory>> = {
  'Market data': 'Market Data',
  Watchlists: 'Watchlists & Screener',
  Alerts: 'Watchlists & Screener',
  Portfolio: 'Portfolio & Notes',
  AI: 'AI & Mitra Copilot',
  Advisor: 'AI & Mitra Copilot',
  System: 'System & Cron',
  Cron: 'System & Cron',
  Settings: 'System & Cron',
  Notifications: 'System & Cron',
};

/** Path prefixes whose tag would put them in the wrong place for a reader. */
const PATH_CATEGORY: ReadonlyArray<readonly [string, ApiCategory]> = [
  ['/api/screener', 'Watchlists & Screener'],
  ['/api/notes', 'Portfolio & Notes'],
];

export interface DocEndpoint {
  path: string;
  tag: string | undefined;
}

export function categoryOf(path: string, tag: string | undefined): ApiCategory {
  const byPath = PATH_CATEGORY.find(([prefix]) => path === prefix || path.startsWith(`${prefix}/`));
  if (byPath) return byPath[1];
  return (tag && TAG_CATEGORY[tag]) || 'System & Cron';
}

/** Non-empty categories in fixed display order; items keep their input order. */
export function groupEndpoints<T extends DocEndpoint>(
  endpoints: readonly T[]
): Array<{ category: ApiCategory; items: T[] }> {
  return CATEGORY_ORDER.map((category) => ({
    category,
    items: endpoints.filter((e) => categoryOf(e.path, e.tag) === category),
  })).filter((g) => g.items.length > 0);
}

// Turning the curated theme taxonomy and the data service's real sectors and industries into suggestions for the Theme
// picker, and a typed theme back into the industries to research (#378). Pure: the facets are passed in.

import { THEME_TAXONOMY } from './themeTaxonomy';

export interface ThemeFacets {
  readonly sectors: readonly string[];
  readonly industries: readonly string[];
  readonly sector_counts?: Readonly<Record<string, number>>;
  readonly industry_counts?: Readonly<Record<string, number>>;
}

export type ThemeKind = 'theme' | 'sector' | 'industry';

export interface ThemeOption {
  readonly kind: ThemeKind;
  readonly label: string;
  /** The data service's sector names the theme covers (whole sector), if it is a sector. */
  readonly sectors: readonly string[];
  /** The data service's industry names the theme covers. */
  readonly industries: readonly string[];
  /** Listed companies in it. */
  readonly count: number;
  /** Lower-case words it can be found by. */
  readonly aliases: readonly string[];
}

const norm = (s: string): string => s.toLowerCase().trim();
const countOf = (counts: Readonly<Record<string, number>> | undefined, name: string): number => counts?.[name] ?? 0;

/** Every theme worth suggesting: the curated ones that match at least one live industry, then each live sector and industry. */
export function buildThemeOptions(facets: ThemeFacets): ThemeOption[] {
  const curated: ThemeOption[] = THEME_TAXONOMY.flatMap((def) => {
    const industries = facets.industries.filter((name) => def.industries.some((frag) => norm(name).includes(frag)));
    if (industries.length === 0) return [];
    const count = industries.reduce((n, name) => n + countOf(facets.industry_counts, name), 0);
    return [{ kind: 'theme' as const, label: def.label, sectors: [], industries, count, aliases: def.aliases.map(norm) }];
  });
  const taken = new Set(curated.map((o) => norm(o.label)));
  const sectors: ThemeOption[] = facets.sectors
    .filter((name) => !taken.has(norm(name)))
    .map((name) => ({ kind: 'sector', label: name, sectors: [name], industries: [], count: countOf(facets.sector_counts, name), aliases: [] }));
  // A theme that is exactly one industry already stands for it.
  const covered = new Set(curated.filter((o) => o.industries.length === 1).map((o) => o.industries[0]));
  const industries: ThemeOption[] = facets.industries
    .filter((name) => !taken.has(norm(name)) && !covered.has(name) && !sectors.some((s) => norm(s.label) === norm(name)))
    .map((name) => ({ kind: 'industry', label: name, sectors: [], industries: [name], count: countOf(facets.industry_counts, name), aliases: [] }));
  return [...curated, ...sectors, ...industries];
}

const words = (text: string): string[] => norm(text).split(/[^a-z0-9/]+/).filter(Boolean);

/** How well an option answers the query: lower is better, null is no match. */
function rank(option: ThemeOption, query: string, queryWords: readonly string[]): number | null {
  const label = norm(option.label);
  if (label === query) return 0;
  if (label.startsWith(query)) return 1;
  const labelWords = words(option.label);
  if (queryWords.every((q) => labelWords.some((w) => w.startsWith(q)))) return 2;
  if (queryWords.every((q) => option.aliases.some((a) => a.startsWith(q)))) return 3;
  // A live industry name inside the theme ("semiconductor" is not a name, but "consumer electronics" is).
  if (queryWords.every((q) => option.industries.some((i) => words(i).some((w) => w.startsWith(q))))) return 4;
  return null;
}

/** The options that match what was typed, best first (curated themes before sectors before industries on a tie, then larger first). */
export function suggestThemes(options: readonly ThemeOption[], text: string, limit = 8): ThemeOption[] {
  const query = norm(text);
  const kindOrder: Record<ThemeKind, number> = { theme: 0, sector: 1, industry: 2 };
  if (query.length === 0) {
    return options.filter((o) => o.kind === 'theme').sort((a, b) => b.count - a.count).slice(0, limit);
  }
  const queryWords = words(query);
  if (queryWords.length === 0) return [];
  return options
    .flatMap((o) => {
      const r = rank(o, query, queryWords);
      return r === null ? [] : [{ o, r }];
    })
    .sort((a, b) => a.r - b.r || kindOrder[a.o.kind] - kindOrder[b.o.kind] || b.o.count - a.o.count || a.o.label.localeCompare(b.o.label))
    .slice(0, limit)
    .map(({ o }) => o);
}

/** The theme a typed or picked label stands for: an exact label first, otherwise the best suggestion; null when nothing fits. */
export function resolveTheme(options: readonly ThemeOption[], text: string): ThemeOption | null {
  const query = norm(text);
  if (query.length === 0) return null;
  return options.find((o) => norm(o.label) === query) ?? suggestThemes(options, text, 1)[0] ?? null;
}

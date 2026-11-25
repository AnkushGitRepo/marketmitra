// Theme presets for the research page and the matching of a theme to the screener's real
// sector names (which come from the data service, so they are never hand-copied here).

export interface ThemePreset {
  readonly label: string;
  /** Words that identify the sector(s) the theme covers. */
  readonly keywords: readonly string[];
}

export const THEME_PRESETS: readonly ThemePreset[] = [
  { label: 'Indian Telecom', keywords: ['telecom'] },
  { label: 'Banking & NBFCs', keywords: ['banking', 'finance', 'nbfc'] },
  { label: 'Pharma & CDMO', keywords: ['pharma', 'healthcare'] },
  { label: 'Defence & Railways', keywords: ['defence', 'railways', 'capital'] },
  { label: 'IT Services', keywords: ['technology', 'software'] },
  { label: 'Renewable Energy', keywords: ['renewable', 'power', 'energy'] },
];

const STOPWORDS = new Set(['indian', 'india', 'sector', 'sectors', 'outlook', 'theme', 'stocks', 'and', 'the']);
const MIN_WORD = 4;
const STEM_LENGTH = 4;

/** Lower-case words of at least four letters, cut to a four-letter stem ("banking" and "banks" both become "bank"). */
function stems(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length >= MIN_WORD && !STOPWORDS.has(w))
    .map((w) => w.slice(0, STEM_LENGTH));
}

/** The sector names (in the given order) a theme refers to: a preset's keywords, or the words of free text. */
export function matchThemeToSectors(theme: string, sectors: readonly string[]): string[] {
  const preset = THEME_PRESETS.find((p) => p.label.toLowerCase() === theme.trim().toLowerCase());
  const wanted = new Set(preset ? preset.keywords.flatMap(stems) : stems(theme));
  if (wanted.size === 0) return [];
  return sectors.filter((sector) => stems(sector).some((s) => wanted.has(s)));
}

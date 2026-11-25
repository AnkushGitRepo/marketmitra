import { describe, expect, it } from 'vitest';
import { buildThemeOptions, resolveTheme, suggestThemes, type ThemeFacets } from './themeSearch';
import { THEME_TAXONOMY } from './themeTaxonomy';

const FACETS: ThemeFacets = {
  sectors: ['Capital Goods', 'Telecommunication', 'Healthcare'],
  industries: ['Aerospace & Defense', 'Railway Wagons', 'Consumer Electronics', 'Pharmaceuticals', 'Telecom - Cellular & Fixed line services', 'Other Telecom Services', 'Sugar', 'Hospital', 'Trading & Distributors'],
  sector_counts: { 'Capital Goods': 300, Telecommunication: 14, Healthcare: 200 },
  industry_counts: { 'Aerospace & Defense': 27, 'Railway Wagons': 3, 'Consumer Electronics': 13, Pharmaceuticals: 128, 'Telecom - Cellular & Fixed line services': 8, 'Other Telecom Services': 6, Sugar: 27, Hospital: 25, 'Trading & Distributors': 30 },
};
const options = buildThemeOptions(FACETS);
const labels = (text: string) => suggestThemes(options, text).map((o) => o.label);

describe('the taxonomy', () => {
  it('has at least 35 distinct themes', () => {
    expect(THEME_TAXONOMY.length).toBeGreaterThanOrEqual(35);
    expect(new Set(THEME_TAXONOMY.map((d) => d.label)).size).toBe(THEME_TAXONOMY.length);
  });
});

describe('buildThemeOptions', () => {
  it('resolves a curated theme to the live industries and sums their companies', () => {
    const telecom = options.find((o) => o.label === 'Telecom');
    expect(telecom?.industries).toEqual(['Telecom - Cellular & Fixed line services', 'Other Telecom Services']);
    expect(telecom?.count).toBe(14);
  });
  it('drops a curated theme none of whose industries exist', () => {
    expect(options.find((o) => o.label === 'Banks')).toBeUndefined();
  });
  it('adds live sectors and industries as plain options', () => {
    expect(options.find((o) => o.label === 'Capital Goods')).toMatchObject({ kind: 'sector', count: 300 });
    expect(options.find((o) => o.label === 'Trading & Distributors')).toMatchObject({ kind: 'industry', count: 30 });
  });
  it('does not list an industry again when a one-industry theme already stands for it', () => {
    expect(options.find((o) => o.label === 'Aerospace & Defense')).toBeUndefined();
    expect(options.find((o) => o.label === 'Defence & Aerospace')).toBeDefined();
  });
  it('does not repeat a sector that a theme already covers by name', () => {
    expect(options.filter((o) => o.label.toLowerCase() === 'telecommunication')).toHaveLength(1);
  });
});

describe('suggestThemes', () => {
  it('finds a theme from the start of a word', () => {
    expect(labels('def')[0]).toBe('Defence & Aerospace');
    expect(labels('rail')[0]).toBe('Railways & Rolling Stock');
  });
  it('finds a theme by an alias', () => {
    expect(labels('chip')[0]).toBe('Electronics & EMS');
    expect(labels('hospital')).toContain('Hospitals & Healthcare Services');
  });
  it('is case-insensitive and ignores surrounding spaces', () => {
    expect(labels('  DEFENCE ')[0]).toBe('Defence & Aerospace');
  });
  it('shows the biggest curated themes when nothing is typed', () => {
    const shown = suggestThemes(options, '');
    expect(shown.every((o) => o.kind === 'theme')).toBe(true);
    expect(shown[0].label).toBe('Pharma & CDMO');
  });
  it('does not match the middle of a word', () => {
    expect(labels('sem')).not.toContain('Amusement Parks/ Other Recreation');
  });
  it('returns nothing for nonsense and honours the limit', () => {
    expect(labels('zzzzqq')).toEqual([]);
    expect(suggestThemes(options, 'e', 2)).toHaveLength(2);
  });
});

describe('resolveTheme', () => {
  it('takes an exact label, then the best suggestion, else null', () => {
    expect(resolveTheme(options, 'telecom')?.label).toBe('Telecom');
    expect(resolveTheme(options, 'defence')?.label).toBe('Defence & Aerospace');
    expect(resolveTheme(options, 'zzzzqq')).toBeNull();
    expect(resolveTheme(options, '  ')).toBeNull();
  });
});

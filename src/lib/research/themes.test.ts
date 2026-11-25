import { describe, expect, it } from 'vitest';
import { THEME_PRESETS, matchThemeToSectors } from './themes';

const SECTORS = ['Telecommunications', 'Pharmaceuticals', 'Banks', 'Information Technology', 'Capital Goods'];

describe('matchThemeToSectors', () => {
  it('matches a preset pill to the real sector names', () => {
    const preset = THEME_PRESETS.find((p) => p.label === 'Indian Telecom');
    expect(matchThemeToSectors(preset!.label, SECTORS)).toEqual(['Telecommunications']);
  });
  it('matches free text by shared words with a sector name', () => {
    expect(matchThemeToSectors('pharma sector outlook', SECTORS)).toEqual(['Pharmaceuticals']);
  });
  it('can match several sectors for a broad theme', () => {
    expect(matchThemeToSectors('Banking & NBFCs', [...SECTORS, 'Finance'])).toEqual(['Banks', 'Finance']);
  });
  it('returns nothing when no sector is close', () => {
    expect(matchThemeToSectors('quantum computing', SECTORS)).toEqual([]);
  });
});

describe('THEME_PRESETS against the data service sector names', () => {
  const LIVE = [
    'Capital Goods',
    'Fast Moving Consumer Goods',
    'Financial Services',
    'Healthcare',
    'Information Technology',
    'Power',
    'Services',
    'Telecommunication',
    'Utilities',
  ];
  it.each([
    ['Indian Telecom', ['Telecommunication']],
    ['Banking & NBFCs', ['Financial Services']],
    ['Pharma & CDMO', ['Healthcare']],
    ['Defence & Railways', ['Capital Goods']],
    ['IT Services', ['Information Technology']],
    ['Renewable Energy', ['Power']],
  ])('%s finds its sector and no stray one', (label, expected) => {
    expect(matchThemeToSectors(label, LIVE)).toEqual(expected);
  });
});

import { describe, expect, it } from 'vitest';
import { stripCitationMarkers } from './transforms';

describe('stripCitationMarkers', () => {
  it('strips a single trailing citation marker', () => {
    expect(stripCitationMarkers('Founded in 1994.[1]')).toBe('Founded in 1994.');
  });

  it('strips multiple consecutive trailing markers', () => {
    expect(stripCitationMarkers('Founded in 1994.[1][2]')).toBe('Founded in 1994.');
  });

  it('strips a marker separated from the text by whitespace', () => {
    expect(stripCitationMarkers('Founded in 1994. [12]')).toBe('Founded in 1994.');
  });

  it('leaves text with no trailing marker unchanged', () => {
    expect(stripCitationMarkers('Founded in 1994.')).toBe('Founded in 1994.');
  });

  it('strips a bracketed number in the middle of the text too, collapsing the gap', () => {
    expect(stripCitationMarkers('It operates [1] branch nationwide.')).toBe(
      'It operates branch nationwide.'
    );
  });

  it('handles a real stranded mid-sentence marker (Federal Bank About text)', () => {
    expect(
      stripCitationMarkers('...foreign exchange business. [1] .It is the second-largest bank...')
    ).toBe('...foreign exchange business. .It is the second-largest bank...');
  });
});

import { describe, expect, it } from 'vitest';
import { MAX_RESEARCH_BODY, MAX_TITLE } from '@/lib/notes/limits';
import { noteBody, suggestNote } from './saveNote';

const AT = '2026-11-25T08:30:00.000Z';

describe('suggestNote', () => {
  it('names a company note by its name and symbol, and files it under the symbol', () => {
    expect(suggestNote({ type: 'company', symbol: 'BHARTIARTL', name: 'Bharti Airtel Limited' }, AT)).toEqual({
      title: 'Bharti Airtel Limited (BHARTIARTL): research brief, 25 Nov 2026',
      symbol: 'BHARTIARTL',
      tickers: ['BHARTIARTL'],
    });
  });
  it('lists every symbol of a comparison, with no main symbol', () => {
    const note = suggestNote({ type: 'comparison', symbols: ['JPL', 'BHARTIARTL', 'IDEA'] }, AT);
    expect(note.title).toBe('JPL vs BHARTIARTL vs IDEA: research brief, 25 Nov 2026');
    expect(note.symbol).toBeNull();
    expect(note.tickers).toEqual(['JPL', 'BHARTIARTL', 'IDEA']);
  });
  it('titles a theme and a portfolio with no symbols', () => {
    expect(suggestNote({ type: 'theme', text: ' Indian Telecom ' }, AT)).toMatchObject({ title: 'Indian Telecom: research brief, 25 Nov 2026', tickers: [] });
    expect(suggestNote({ type: 'portfolio' }, AT).title).toBe('My portfolio: research brief, 25 Nov 2026');
  });
  it('keeps the title within the note limit', () => {
    expect(suggestNote({ type: 'theme', text: 'x'.repeat(300) }, AT).title).toHaveLength(MAX_TITLE);
  });
});

describe('noteBody', () => {
  it('adds the footer and stays within the research limit', () => {
    const body = noteBody('## What it is\nText', 'gemini', AT);
    expect(body).toContain('Text');
    expect(body).toContain('AI-generated research brief (gemini), 25 Nov 2026');
    expect(noteBody('y'.repeat(MAX_RESEARCH_BODY * 2), 'gemini', AT).length).toBeLessThanOrEqual(MAX_RESEARCH_BODY);
  });
});

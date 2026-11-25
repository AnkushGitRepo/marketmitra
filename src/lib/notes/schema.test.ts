import { describe, expect, it } from 'vitest';
import { MAX_BODY, MAX_RESEARCH_BODY } from './limits';
import { createNoteSchema, updateNoteSchema } from './schema';

describe('createNoteSchema', () => {
  it('accepts an ordinary note and a saved research report with tickers', () => {
    expect(createNoteSchema.safeParse({ title: 't', body: 'b' }).success).toBe(true);
    expect(createNoteSchema.safeParse({ title: 't', body: 'b', source: 'research', tickers: ['TCS', 'INFY'] }).success).toBe(true);
  });
  it('holds a manual note to the short limit but lets research run long', () => {
    const long = 'x'.repeat(MAX_BODY + 1);
    expect(createNoteSchema.safeParse({ title: 't', body: long }).success).toBe(false);
    expect(createNoteSchema.safeParse({ title: 't', body: long, source: 'research' }).success).toBe(true);
    expect(createNoteSchema.safeParse({ title: 't', body: 'x'.repeat(MAX_RESEARCH_BODY + 1), source: 'research' }).success).toBe(false);
  });
  it('rejects an unknown source and too many tickers', () => {
    expect(createNoteSchema.safeParse({ title: 't', body: 'b', source: 'import' }).success).toBe(false);
    expect(createNoteSchema.safeParse({ title: 't', body: 'b', tickers: Array.from({ length: 9 }, (_, i) => `S${i}`) }).success).toBe(false);
  });
});

describe('updateNoteSchema', () => {
  it('does not take a source, and needs a title and a body', () => {
    expect(updateNoteSchema.safeParse({ title: '', body: 'b' }).success).toBe(false);
    expect(updateNoteSchema.safeParse({ title: 't', body: 'b', tickers: ['TCS'] }).success).toBe(true);
  });
});

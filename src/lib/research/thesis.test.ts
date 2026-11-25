import { describe, expect, it } from 'vitest';
import { parseThesis, salvageSummary, thesisBlock } from './thesis';

const json = JSON.stringify({
  summary: '## What it is\nA telecom operator.',
  catalysts: ['Tariff hikes'],
  risks: ['Spectrum payments'],
  questions: [],
});

describe('parseThesis', () => {
  it('reads plain JSON', () => {
    expect(parseThesis(json)?.catalysts).toEqual(['Tariff hikes']);
  });
  it('reads JSON inside a code fence or after a sentence', () => {
    expect(parseThesis('```json\n' + json + '\n```')?.risks).toEqual(['Spectrum payments']);
    expect(parseThesis('Here is the brief: ' + json)?.summary).toContain('telecom');
  });
  it('defaults missing lists to empty', () => {
    expect(parseThesis('{"summary":"x"}')).toEqual({ summary: 'x', catalysts: [], risks: [], questions: [] });
  });
  it('rejects prose, broken JSON and a missing summary', () => {
    expect(parseThesis('## What it is\nplain markdown')).toBeNull();
    expect(parseThesis('{"summary": "cut off')).toBeNull();
    expect(parseThesis('{"catalysts":["a"]}')).toBeNull();
  });
});

describe('thesisBlock', () => {
  it('keeps only the columns that have items', () => {
    const block = thesisBlock(parseThesis(json)!);
    expect(block?.columns.map((c) => c.title)).toEqual(['Catalysts', 'Risks and watch-items']);
  });
  it('is null when every column is empty', () => {
    expect(thesisBlock({ summary: 'x', catalysts: [], risks: [], questions: [] })).toBeNull();
  });
});

describe('salvageSummary', () => {
  it('reads the prose out of a reply cut off mid-string', () => {
    const cut = '{"summary": "## What it is\\nA portfolio of \\"13\\" stocks, heavy in fin';
    expect(salvageSummary(cut)).toBe('## What it is\nA portfolio of "13" stocks, heavy in fin');
  });
  it('survives a cut inside an escape', () => {
    expect(salvageSummary('{"summary": "abc\\')).toBe('abc');
    expect(salvageSummary('{"summary": "abc\\u00')).toBe('abc');
  });
  it('is null for markdown and for an empty summary', () => {
    expect(salvageSummary('## What it is\nplain')).toBeNull();
    expect(salvageSummary('{"summary": "')).toBeNull();
  });
});

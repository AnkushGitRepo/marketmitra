import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { noteDocx, noteFileBase, noteMarkdown, noteText } from './exportNote';

const note = {
  title: 'Telecom: research brief, 25 Nov',
  body: '## Overview\n\nAirtel leads on **ARPU**.\n\n- Jio leads on subscribers\n- Idea trails\n\n| Measure | JPL | IDEA |\n| --- | --- | --- |\n| ARPU | 215 | 195 |',
  symbol: 'JPL',
  tickers: ['IDEA'],
  source: 'research' as const,
  updatedAt: new Date('2026-11-25T10:00:00Z'),
};

describe('noteFileBase', () => {
  it('names the file from the title and the date, safely', () => {
    expect(noteFileBase(note)).toBe('MarketMitra-note-Telecom-research-brief-25-Nov-2026-11-25');
    expect(noteFileBase({ ...note, title: '   ', updatedAt: '2026-01-02T00:00:00Z' })).toBe('MarketMitra-note-untitled-2026-01-02');
    expect(noteFileBase({ ...note, title: 'a/b\\c:d*e' })).not.toMatch(/[\\/:*]/);
  });
});

describe('noteMarkdown', () => {
  it('has front matter with the tickers, then the title and the body unchanged', () => {
    const md = noteMarkdown(note);
    expect(md.startsWith('---\ntitle: "Telecom: research brief, 25 Nov"\nkind: saved research\ndate: 2026-11-25\ntickers: [JPL, IDEA]\n---')).toBe(true);
    expect(md).toContain('# Telecom: research brief, 25 Nov\n\n## Overview');
    expect(md).toContain('| ARPU | 215 | 195 |');
  });
  it('leaves out tickers when there are none', () => {
    expect(noteMarkdown({ ...note, symbol: null, tickers: [] })).not.toContain('tickers:');
  });
});

describe('noteText', () => {
  it('has no markdown marks and keeps the words', () => {
    const t = noteText(note);
    expect(t).toContain('TELECOM: RESEARCH BRIEF, 25 NOV');
    expect(t).toContain('Saved research | 2026-11-25 | JPL, IDEA');
    expect(t).not.toMatch(/\*\*|^##/m);
    expect(t).toContain('Airtel leads on ARPU.');
    expect(t).toContain('- Jio leads on subscribers');
  });
});

describe('noteDocx', () => {
  it('is a Word file holding the title, the headings and the table text', async () => {
    const files = unzipSync(new Uint8Array(await (await noteDocx(note)).arrayBuffer()));
    const xml = strFromU8(files['word/document.xml']);
    expect(xml).toContain('Telecom: research brief, 25 Nov');
    expect(xml).toContain('Overview');
    expect(xml).toContain('Jio leads on subscribers');
    expect(xml).toContain('ARPU');
  });
});

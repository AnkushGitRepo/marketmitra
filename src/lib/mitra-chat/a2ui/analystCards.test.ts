import { MessageProcessor } from '@a2ui/web_core';
import { basicCatalog } from '@a2ui/web_core/catalogs/basic/v1';
import { describe, expect, it } from 'vitest';
import type { Dossier, JournalEntry } from '@/lib/analysts/types';
import { buildAnalystCard, buildDeskOverview, type DeskView } from './analystCards';

const dossier: Dossier = {
  summary: 'A large private bank with steady margins and a clean balance sheet.',
  business: 'Retail and corporate banking.',
  strengths: [{ title: 'Low credit cost', text: 'Gross NPA is below peers.' }],
  vulnerabilities: [
    { title: 'Deposit growth', text: 'Deposits grew slower than loans.' },
    { title: 'Valuation', text: 'Trades above its five-year average.' },
  ],
  notAvailable: ['Concall commentary'],
  generatedAt: '2026-11-01T00:00:00.000Z',
  model: 'test',
};
const entry = (title: string, ts: string, impact: JournalEntry['impact'] = 'neutral'): JournalEntry => ({
  id: title,
  symbol: 'HDFCBANK',
  ts,
  kind: 'news',
  title,
  body: 'body text',
  impact,
  alert: 'low',
});

const textsOf = (messages: readonly unknown[]): string[] =>
  JSON.stringify(messages)
    .match(/"text":"(?:[^"\\]|\\.)*"/g)
    ?.map((t) => JSON.parse(`{${t}}`).text as string) ?? [];

const accepted = (messages: readonly unknown[]) => {
  const p = new MessageProcessor([basicCatalog]);
  p.processMessages(messages as never);
  return p.model.surfacesMap.size;
};

describe('buildAnalystCard', () => {
  const card = buildAnalystCard({ symbol: 'HDFCBANK', status: 'active', statusNote: null, dossier, journal: [entry('Q2 results beat', '2026-11-10T10:00:00Z', 'positive'), entry('Rating note', '2026-11-05T10:00:00Z')] });

  it('shows the stored summary, risks and latest notes', () => {
    const t = textsOf(card.messages);
    expect(t).toContain('HDFCBANK analyst · Active');
    expect(t).toContain(dossier.summary);
    expect(t.some((x) => x.startsWith('Deposit growth'))).toBe(true);
    expect(t).toContain('Q2 results beat');
    expect(t).toContain('Positive');
    expect(t).toContain('10 Nov 2026');
  });

  it('says when there is no dossier yet instead of inventing one', () => {
    const t = textsOf(buildAnalystCard({ symbol: 'ITC', status: 'initializing', statusNote: null, dossier: null, journal: [] }).messages);
    expect(t.join(' ')).toMatch(/no dossier yet/i);
    expect(t).toContain('ITC analyst · Initializing');
  });

  it('shows the status note when the analyst is in error', () => {
    const t = textsOf(buildAnalystCard({ symbol: 'ITC', status: 'error', statusNote: 'Quote feed offline', dossier: null, journal: [] }).messages);
    expect(t).toContain('Quote feed offline');
  });

  it('caps long model text and caps the lists', () => {
    const long = { ...dossier, summary: 'x'.repeat(900), vulnerabilities: Array.from({ length: 6 }, (_, i) => ({ title: `V${i}`, text: 'y'.repeat(500) })) };
    const t = textsOf(buildAnalystCard({ symbol: 'A', status: 'active', statusNote: null, dossier: long, journal: [] }).messages);
    expect(Math.max(...t.map((x) => x.length))).toBeLessThanOrEqual(300);
    expect(t.filter((x) => /^V\d/.test(x))).toHaveLength(3);
  });

  it('keeps markup-looking text as plain text and gives the model a summary without layout', () => {
    const evil = buildAnalystCard({ symbol: 'A', status: 'active', statusNote: null, dossier: { ...dossier, summary: '<img src=x onerror=alert(1)> [link](https://evil.example)' }, journal: [] });
    expect(JSON.stringify(evil.messages)).toContain('<img src=x'); // stored verbatim as a string; the renderer shows it as text
    expect(evil.summary).toMatch(/already shown to the user/i);
    expect(evil.summary).not.toContain('"component"');
  });

  it('is accepted by the real A2UI processor', () => {
    expect(accepted(card.messages)).toBe(1);
  });
});

describe('buildDeskOverview', () => {
  const view = (symbol: string, status: DeskView['status'], latest: JournalEntry | null = null): DeskView => ({ symbol, status, summary: `${symbol} summary`, latest });

  it('returns null for an empty desk', () => {
    expect(buildDeskOverview([])).toBeNull();
  });

  it('lists each analyst with status and latest note, and counts by status', () => {
    const snap = buildDeskOverview([view('HDFCBANK', 'active', entry('Q2 results beat', '2026-11-10T10:00:00Z', 'positive')), view('ITC', 'paused'), view('TCS', 'active')])!;
    const t = textsOf(snap.messages);
    expect(t).toContain('Analyst desk · 3 analysts');
    expect(t).toContain('2 active · 1 paused');
    expect(t).toContain('HDFCBANK');
    expect(t).toContain('Q2 results beat');
    expect(t).toContain('No notes yet');
  });

  it('caps the list and says how many more', () => {
    const many = Array.from({ length: 11 }, (_, i) => view(`S${i}`, 'active'));
    const t = textsOf(buildDeskOverview(many)!.messages);
    expect(t.filter((x) => /^S\d+$/.test(x))).toHaveLength(8);
    expect(t).toContain('+ 3 more analysts');
  });

  it('is accepted by the real A2UI processor and does not mutate its input', () => {
    const input = [view('A', 'active')];
    const copy = JSON.parse(JSON.stringify(input));
    const snap = buildDeskOverview(input)!;
    expect(accepted(snap.messages)).toBe(1);
    expect(input).toEqual(copy);
  });
});

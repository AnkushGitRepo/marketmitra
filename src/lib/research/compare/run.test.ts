import { describe, expect, it } from 'vitest';
import type { ReportEvent } from '../report/chapters';
import type { TaskOutcome } from '../report/run';
import { trio } from './fixtures';
import { runCompareReport, type CompareRunDeps } from './run';
import type { CompareTask } from './tasks';

const reply = (task: CompareTask): TaskOutcome => {
  if (task.id === 'structure') {
    return { ok: true, model: 'test-model', searched: [], sources: [], text: JSON.stringify({ sector_kpis: [{ measure: 'ARPU', unit: '', values: [{ symbol: 'JPL', value: '215' }], leader: 'JPL' }], profiles: [{ symbol: 'JPL', business: 'a', mix: '', moat: '', edge: 'Scale', lags: '' }, { symbol: 'IDEA', business: 'b', mix: '', moat: '', edge: '', lags: '' }], issues: [{ symbol: 'IDEA', severity: 'CRITICAL', issue: 'Dues.' }, { symbol: 'JPL', severity: 'NORMAL', issue: 'Spectrum.' }] }) };
  }
  return {
    ok: true,
    model: 'test-model',
    searched: task.search ? [{ tool: 'web_search', input: 'q', ok: true } as never] : [],
    sources: [],
    text:
      task.chapters
        .map((id) => (id === 'cmp_questions' ? `## CHAPTER: ${id}\n${[1, 2, 3, 4, 5, 6].map((n) => `${n}. **Question ${n}?** - look at the filing.`).join('\n')}` : `## CHAPTER: ${id}\nText for ${id}.`))
        .join('\n\n') + '\n\nThis is a synthesis of public data, not investment advice.',
  };
};

const deps = (generate: CompareRunDeps['generate']): CompareRunDeps => ({ generate, retrieve: async () => [], now: () => new Date('2026-11-26T10:00:00Z') });
const collect = async (d: CompareRunDeps): Promise<ReportEvent[]> => {
  const out: ReportEvent[] = [];
  for await (const e of runCompareReport(trio(), d)) out.push(e);
  return out;
};
const last = (events: ReportEvent[], id: string) => events.flatMap((e) => (e.type === 'chapter' && e.chapter.id === id ? [e.chapter] : [])).at(-1)!;

describe('runCompareReport', () => {
  it('titles the report with the symbols and streams the figures before any text, then all seven chapters', async () => {
    const events = await collect(deps(async (t) => reply(t)));
    expect(events[0]).toMatchObject({ type: 'start', name: 'JPL vs BHARTIARTL vs IDEA' });
    const firstText = events.findIndex((e) => e.type === 'chapter' && e.chapter.prose);
    const figures = events.slice(1, firstText).map((e) => (e.type === 'chapter' ? e.chapter.id : e.type));
    expect(figures).toEqual(['cmp_verdict', 'cmp_trajectory', 'cmp_matrix', 'cmp_valuation']);
    const ready = events.flatMap((e) => (e.type === 'chapter' && e.chapter.status === 'ready' ? [e.chapter.id] : []));
    expect(new Set(ready)).toEqual(new Set(['cmp_verdict', 'cmp_trajectory', 'cmp_matrix', 'cmp_profiles', 'cmp_issues', 'cmp_valuation', 'cmp_questions']));
    expect(events.at(-1)).toMatchObject({ type: 'done', model: 'test-model' });
  });

  it('writes the verdict after the others, from their text, and the questions last, neither searching', async () => {
    const calls: CompareTask[] = [];
    await collect(deps(async (t) => (calls.push(t), reply(t))));
    const ids = calls.map((c) => c.id);
    expect(ids.indexOf('verdict')).toBeGreaterThan(ids.indexOf('business'));
    expect(ids.indexOf('verdict')).toBeGreaterThan(ids.indexOf('issues'));
    expect(ids.slice(-2)).toEqual(['questions', 'structure']);
    const verdict = calls.find((c) => c.id === 'verdict')!;
    expect(verdict.search).toBeNull();
    expect(verdict.prompt).toContain('Text for cmp_matrix.');
    expect(calls.find((c) => c.id === 'questions')!.search).toBeNull();
    expect(calls.filter((c) => ['business', 'issues', 'outlook'].includes(c.id)).every((c) => c.search !== null)).toBe(true);
  });

  it('adds the sector table, profile cards and issue cards, and turns the questions into numbered cards', async () => {
    const events = await collect(deps(async (t) => reply(t)));
    expect(last(events, 'cmp_matrix').blocks.some((b) => b.type === 'data_table' && b.title === 'Sector measures')).toBe(true);
    expect(last(events, 'cmp_profiles').blocks[0]).toMatchObject({ type: 'card_grid' });
    expect(last(events, 'cmp_issues').blocks[0]).toMatchObject({ type: 'card_grid' });
    const q = last(events, 'cmp_questions');
    expect(q.prose).toBeNull();
    expect(q.blocks[0]).toMatchObject({ type: 'card_grid', numbered: true, title: 'Questions that separate these companies' });
  });

  it('keeps every chapter when the extraction fails, and keeps the figures when a call fails', async () => {
    const events = await collect(deps(async (t) => (t.id === 'structure' ? { ok: false, error: 'bad' } : t.id === 'issues' ? { ok: false, error: 'boom' } : reply(t))));
    expect(last(events, 'cmp_issues').status).toBe('failed');
    expect(last(events, 'cmp_matrix').blocks.some((b) => b.type === 'data_table' && b.title === 'Head to head')).toBe(true);
    expect(last(events, 'cmp_profiles').blocks).toEqual([]);
    expect(events.at(-1)?.type).toBe('done');
  });

  it('errors only when every call fails', async () => {
    const events = await collect(deps(async () => ({ ok: false, error: 'no quota' })));
    expect(events.at(-1)).toEqual({ type: 'error', message: 'no quota' });
  });

  it('puts the disclaimer once, and a note that names the companies', async () => {
    const done = (await collect(deps(async (t) => reply(t)))).at(-1);
    if (done?.type !== 'done') throw new Error('not done');
    expect(done.content.match(/not investment advice/g)).toHaveLength(1);
    expect(JSON.stringify(done.note)).toContain('JPL');
  });
});

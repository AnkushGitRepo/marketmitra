import { describe, expect, it } from 'vitest';
import type { ReportEvent } from '../report/chapters';
import type { TaskOutcome } from '../report/run';
import { book } from './fixtures';
import { runPortfolioReport, type PortfolioRunDeps } from './run';
import type { PortfolioTask } from './tasks';

const inputs = { positions: book(), omitted: 0 };

const reply = (task: PortfolioTask): TaskOutcome => ({
  ok: true,
  model: 'test-model',
  searched: [],
  sources: [],
  text:
    task.chapters
      .map((id) => (id === 'pf_checklist' ? `## CHAPTER: ${id}\n${[1, 2, 3, 4, 5, 6].map((n) => `${n}. **Holding ${n}: what to check?** - look at the result.`).join('\n')}` : `## CHAPTER: ${id}\nText for ${id}.`))
      .join('\n\n') + '\n\nThis is a synthesis of public data, not investment advice.',
});

const deps = (generate: PortfolioRunDeps['generate']): PortfolioRunDeps => ({ generate, retrieve: async () => [], now: () => new Date('2026-11-26T10:00:00Z') });
const collect = async (d: PortfolioRunDeps): Promise<ReportEvent[]> => {
  const out: ReportEvent[] = [];
  for await (const e of runPortfolioReport(inputs, d)) out.push(e);
  return out;
};

describe('runPortfolioReport', () => {
  it('streams the figures first, then all seven chapters, then done', async () => {
    const events = await collect(deps(async (t) => reply(t)));
    expect(events[0]).toMatchObject({ type: 'start', name: 'My portfolio' });
    const firstText = events.findIndex((e) => e.type === 'chapter' && e.chapter.prose);
    expect(firstText).toBeGreaterThan(1);
    const ready = events.flatMap((e) => (e.type === 'chapter' && e.chapter.status === 'ready' ? [e.chapter.id] : []));
    expect(new Set(ready)).toEqual(new Set(['pf_health', 'pf_losers', 'pf_factors', 'pf_quality', 'pf_scenarios', 'pf_risks', 'pf_checklist']));
    expect(events.at(-1)).toMatchObject({ type: 'done', model: 'test-model' });
  });

  it('searches for the losers, not for the checklist, and writes the checklist last', async () => {
    const calls: PortfolioTask[] = [];
    await collect(deps(async (t) => (calls.push(t), reply(t))));
    expect(calls.at(-1)?.id).toBe('checklist');
    expect(calls.at(-1)?.search).toBeNull();
    expect(calls.find((c) => c.id === 'forensics')?.search).not.toBeNull();
    expect(calls.find((c) => c.id === 'forensics')?.prompt).toContain('LATENTVIEW');
  });

  it('turns the checklist text into numbered cards', async () => {
    const events = await collect(deps(async (t) => reply(t)));
    const last = events.flatMap((e) => (e.type === 'chapter' && e.chapter.id === 'pf_checklist' ? [e.chapter] : [])).at(-1)!;
    expect(last.prose).toBeNull();
    expect(last.blocks[0]).toMatchObject({ type: 'card_grid', numbered: true, title: 'What to check at the next review' });
  });

  it('keeps the figures when a call fails, and fails only when every call does', async () => {
    const some = await collect(deps(async (t) => (t.id === 'forensics' ? { ok: false, error: 'boom' } : reply(t))));
    const losers = some.flatMap((e) => (e.type === 'chapter' && e.chapter.id === 'pf_losers' ? [e.chapter] : [])).at(-1)!;
    expect(losers.status).toBe('failed');
    expect(losers.blocks.length).toBeGreaterThan(0);
    expect(some.at(-1)?.type).toBe('done');

    const none = await collect(deps(async () => ({ ok: false, error: 'no quota' })));
    expect(none.at(-1)).toEqual({ type: 'error', message: 'no quota' });
  });

  it('puts the disclaimer once at the end of the markdown', async () => {
    const done = (await collect(deps(async (t) => reply(t)))).at(-1);
    if (done?.type !== 'done') throw new Error('not done');
    expect(done.content.match(/not investment advice/g)).toHaveLength(1);
    expect(done.note.title).toBeTruthy();
  });
});

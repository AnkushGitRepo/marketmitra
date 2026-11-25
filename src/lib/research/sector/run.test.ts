import { describe, expect, it, vi } from 'vitest';
import type { ReportEvent } from '../report/chapters';
import type { TaskOutcome } from '../report/run';
import type { ScreenerResultRow } from '@/lib/dashboard/screenerSchema';
import type { SectorInputs } from './inputs';
import { runSectorReport, type SectorRunDeps } from './run';
import type { SectorTask } from './tasks';

const row = (symbol: string, cap: number): ScreenerResultRow =>
  ({ symbol, name: symbol, market_cap: cap, pe: 20, pb: 3, roce: 15, roe: 12, debt_to_equity: 0.5, sales_growth_3y_cagr: 10, profit_growth_3y_cagr: 12 }) as ScreenerResultRow;
const inputs: SectorInputs = { label: 'Defence & Aerospace', kind: 'theme', industries: ['Aerospace & Defense'], sectors: [], count: 27, rows: [row('HAL', 9), row('BEL', 5)] };

const reply = (task: SectorTask): TaskOutcome => ({
  ok: true,
  model: 'test-model',
  searched: task.search ? [{ tool: 'web_search', input: 'q', ok: true } as never] : [],
  sources: [],
  text: task.chapters.map((id) => `## CHAPTER: ${id}\nText for ${id}.`).join('\n\n') + '\n\nThis is a synthesis of public data, not investment advice.',
});

const deps = (generate: SectorRunDeps['generate']): SectorRunDeps => ({ generate, retrieve: async () => [], now: () => new Date('2026-11-25T10:00:00Z') });
const collect = async (d: SectorRunDeps): Promise<ReportEvent[]> => {
  const out: ReportEvent[] = [];
  for await (const e of runSectorReport(inputs, d)) out.push(e);
  return out;
};

describe('runSectorReport', () => {
  it('streams the figures before any text, then every chapter, then done', async () => {
    const events = await collect(deps(async (t) => reply(t)));
    expect(events[0]).toMatchObject({ type: 'start', name: 'Defence & Aerospace' });
    const firstText = events.findIndex((e) => e.type === 'chapter' && e.chapter.prose);
    const figures = events.slice(1, firstText).map((e) => (e.type === 'chapter' ? e.chapter.id : e.type));
    expect(figures).toEqual(['sx_scorecard', 'sx_leaders']);
    const ready = events.flatMap((e) => (e.type === 'chapter' && e.chapter.status === 'ready' ? [e.chapter.id] : []));
    expect(new Set(ready)).toEqual(new Set(['sx_overview', 'sx_scorecard', 'sx_leaders', 'sx_unlisted', 'sx_global', 'sx_outlook', 'sx_policy', 'sx_risks', 'sx_checklist']));
    expect(events.at(-1)).toMatchObject({ type: 'done', model: 'test-model' });
  });

  it('writes the checklist last, from the other chapters, without searching', async () => {
    const calls: SectorTask[] = [];
    await collect(deps(async (t) => (calls.push(t), reply(t))));
    expect(calls.at(-1)?.id).toBe('checklist');
    expect(calls.at(-1)?.search).toBeNull();
    expect(calls.at(-1)?.prompt).toContain('Text for sx_overview.');
    expect(calls.filter((c) => c.id !== 'checklist').every((c) => c.search !== null)).toBe(true);
  });

  it('puts every chapter, its text and the disclaimer once in the markdown', async () => {
    const done = (await collect(deps(async (t) => reply(t)))).find((e) => e.type === 'done');
    const content = done?.type === 'done' ? done.content : '';
    expect(content).toContain('## Sector overview, value chain and economics');
    expect(content).toContain('Text for sx_policy.');
    expect(content.match(/not investment advice/g)).toHaveLength(1);
    expect(done?.type === 'done' && done.note.title).toContain('Defence & Aerospace');
  });

  it('marks a chapter failed when its call fails but still finishes the others', async () => {
    const events = await collect(deps(async (t) => (t.id === 'outlook' ? { ok: false, error: 'quota' } : reply(t))));
    const last = new Map(events.flatMap((e) => (e.type === 'chapter' ? [[e.chapter.id, e.chapter] as const] : [])));
    expect(last.get('sx_outlook')?.status).toBe('failed');
    expect(last.get('sx_outlook')?.note).toBe('quota');
    expect(last.get('sx_risks')?.status).toBe('ready');
    expect(events.at(-1)?.type).toBe('done');
  });

  it('ends with an error, not a done, when every call fails', async () => {
    const events = await collect(deps(async () => ({ ok: false, error: 'no key' })));
    expect(events.at(-1)).toEqual({ type: 'error', message: 'no key' });
  });

  it('never runs more calls at once than the concurrency allows', async () => {
    let live = 0;
    let peak = 0;
    const generate = vi.fn(async (t: SectorTask) => {
      live++;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live--;
      return reply(t);
    });
    await collect(deps(generate));
    expect(peak).toBeLessThanOrEqual(2);
  });
});

import { describe, expect, it, vi } from 'vitest';
import type { ReportChapter, ReportEvent } from './chapters';
import type { ReportInputs } from './inputs';
import { DISCLAIMER, runReport, type RunDeps, type TaskOutcome } from './run';
import type { TaskSpec } from './tasks';

const inputs: ReportInputs = {
  symbol: 'ACME',
  company: { symbol: 'ACME', name: 'Acme Industries Limited', industry: 'Widgets', sector: 'Capital Goods', about: null, source_tier: 't' },
  ratios: [{ name: 'Stock P/E', value: '24', unit: null, as_of: '2026-11-25', source_tier: 't' }],
  profitAndLoss: [{ label: 'Sales', period_type: 'annual', period_end: '2026-03-31', value: '1200', unit: 'INR_CR', source_tier: 't' }],
  balanceSheet: null, cashFlow: null, ratiosHistory: null, shareholding: null, peers: null, prices: null, announcements: null, insights: null,
};

const chapterReply = (...ids: string[]) => `${ids.map((id) => `## CHAPTER: ${id}\nProse of ${id}.`).join('\n\n')}\n\n${DISCLAIMER}`;
const RISKS = JSON.stringify({ risks: [{ category: 'Financial', risk: 'Refinancing of a large bond issue', probability: 'Medium', severity: 'High', watch: 'Credit spreads' }] });

const ok = (text: string, over: Partial<Extract<TaskOutcome, { ok: true }>> = {}): TaskOutcome => ({ ok: true, text, model: 'gemini', searched: [], sources: [], ...over });

function deps(generate: RunDeps['generate']): RunDeps {
  return { generate, retrieve: vi.fn(async () => []), now: () => new Date('2026-11-25T10:00:00Z') };
}

const happy = async (task: TaskSpec): Promise<TaskOutcome> => (task.id === 'risks' ? ok(RISKS) : ok(chapterReply(...task.chapters)));

async function collect(it: AsyncGenerator<ReportEvent>): Promise<ReportEvent[]> {
  const out: ReportEvent[] = [];
  for await (const e of it) out.push(e);
  return out;
}

const chaptersOf = (events: ReportEvent[]): ReportChapter[] => events.flatMap((e) => (e.type === 'chapter' ? [e.chapter] : []));
const last = (events: ReportEvent[], id: string): ReportChapter => chaptersOf(events).filter((c) => c.id === id).at(-1) as ReportChapter;

describe('runReport', () => {
  it('starts with the chapter list and shows the computed chapters before any model call returns', async () => {
    const order: string[] = [];
    const slow = vi.fn(async (task: TaskSpec) => {
      order.push(`call:${task.id}`);
      return happy(task);
    });
    const events: ReportEvent[] = [];
    for await (const e of runReport(inputs, deps(slow))) {
      order.push(e.type === 'chapter' ? `chapter:${e.chapter.id}:${e.chapter.status}` : e.type);
      events.push(e);
    }
    expect(events[0]).toMatchObject({ type: 'start', symbol: 'ACME', name: 'Acme Industries Limited' });
    expect(order.indexOf('chapter:financials:pending')).toBeLessThan(order.indexOf('call:business'));
  });

  it('writes every chapter, the register last, and ends with the markdown, the disclaimer and a note to save', async () => {
    const events = await collect(runReport(inputs, deps(happy)));
    for (const id of ['overview', 'management', 'financials', 'peers', 'valuation', 'sector', 'regulatory', 'legal']) {
      expect(last(events, id)).toMatchObject({ status: 'ready', prose: `Prose of ${id}.` });
    }
    expect(last(events, 'risks')).toMatchObject({ status: 'ready' });
    expect(last(events, 'risks').blocks[0]).toMatchObject({ type: 'data_table', title: 'Risk register' });

    const done = events.at(-1);
    if (done?.type !== 'done') throw new Error('expected done');
    expect(done.model).toBe('gemini');
    expect(done.content).toContain('## Business and thesis');
    expect(done.content.trimEnd().endsWith(DISCLAIMER)).toBe(true);
    expect(done.content.split(DISCLAIMER)).toHaveLength(2); // once, at the end
    expect(done.note).toMatchObject({ symbol: 'ACME', tickers: ['ACME'] });
    expect(done.generatedAt).toBe('2026-11-25T10:00:00.000Z');
  });

  it('reads the other chapters before writing the register', async () => {
    let seen = '';
    await collect(runReport(inputs, deps(async (task) => {
      if (task.id === 'risks') seen = task.prompt;
      return task.id === 'risks' ? ok(RISKS) : ok(chapterReply(...task.chapters));
    })));
    expect(seen).toContain('Prose of overview.');
    expect(seen).toContain('Prose of legal.');
  });

  it('never runs more calls at once than the limit', async () => {
    let running = 0;
    let peak = 0;
    await collect(runReport(inputs, deps(async (task) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      running -= 1;
      return happy(task);
    }), { concurrency: 2 }));
    expect(peak).toBe(2);
  });

  it('keeps the other chapters when one call fails, marking only its chapters failed with the reason', async () => {
    const events = await collect(runReport(inputs, deps(async (task) => (task.id === 'sector' ? { ok: false, error: 'The provider is overloaded' } : happy(task)))));
    expect(last(events, 'sector')).toMatchObject({ status: 'failed', note: 'The provider is overloaded' });
    expect(last(events, 'overview').status).toBe('ready');
    const done = events.at(-1);
    if (done?.type !== 'done') throw new Error('expected done');
    expect(done.content).toContain('*This chapter could not be written: The provider is overloaded*');
  });

  it('marks a chapter the model skipped as failed, not silently empty', async () => {
    const events = await collect(runReport(inputs, deps(async (task) => (task.id === 'business' ? ok(chapterReply('overview')) : happy(task)))));
    expect(last(events, 'overview').status).toBe('ready');
    expect(last(events, 'management')).toMatchObject({ status: 'failed', note: 'The model did not write this chapter.' });
  });

  it('keeps a chapter’s figures when its text fails', async () => {
    const events = await collect(runReport(inputs, deps(async (task) => (task.id === 'numbers' ? { ok: false, error: 'quota' } : happy(task)))));
    expect(last(events, 'financials').status).toBe('failed');
    expect(last(events, 'financials').blocks.length).toBeGreaterThan(0);
  });

  it('shows the register’s text when the model ignores the JSON format, and fails it only when the call fails', async () => {
    const prose = await collect(runReport(inputs, deps(async (task) => (task.id === 'risks' ? ok('The main risk is debt.') : happy(task)))));
    expect(last(prose, 'risks')).toMatchObject({ status: 'ready', prose: 'The main risk is debt.' });
    const failed = await collect(runReport(inputs, deps(async (task) => (task.id === 'risks' ? { ok: false, error: 'down' } : happy(task)))));
    expect(last(failed, 'risks')).toMatchObject({ status: 'failed', note: 'down' });
  });

  it('is an error, not an empty report, when every call fails (a rejected key, say)', async () => {
    const events = await collect(runReport(inputs, deps(async () => ({ ok: false, error: 'That API key was rejected' }))));
    expect(events.at(-1)).toEqual({ type: 'error', message: 'That API key was rejected' });
    expect(events.some((e) => e.type === 'done')).toBe(false);
  });

  it('carries what a chapter searched and the sources it used', async () => {
    const searched = [{ tool: 'web_search' as const, input: 'Acme tribunal order', ok: true, found: 4 }];
    const sources = [{ title: 'Economic Times', url: 'https://et.test/a' }];
    const events = await collect(runReport(inputs, deps(async (task) => (task.id === 'legal' ? ok(chapterReply('regulatory', 'legal'), { searched, sources }) : happy(task)))));
    expect(last(events, 'legal')).toMatchObject({ searched, sources });
  });

  it('asks retrieval once per chapter call, with the query built for it', async () => {
    const d = deps(happy);
    await collect(runReport(inputs, d));
    expect(vi.mocked(d.retrieve)).toHaveBeenCalledTimes(4);
    expect(vi.mocked(d.retrieve).mock.calls.map((c) => c[0]).join(' ')).toContain('Acme Industries Limited');
  });
});

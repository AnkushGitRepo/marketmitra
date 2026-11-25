// Runs the company report (#360, ADR 0081): the computed chapters first, then the model calls with limited concurrency, each
// chapter streamed as its call finishes, and the risk register last because it reads what the others found.

import type { SourceRef } from '@/lib/ai/research/generateWithSearch';
import type { ToolCallRecord } from '@/lib/ai/research/webTools';
import type { GroundingPassage } from '@/lib/rag/insightContext';
import { suggestNote } from '../saveNote';
import { CHAPTERS, chaptersToMarkdown, pendingChapter, type ChapterId, type ReportChapter, type ReportEvent } from './chapters';
import { computeReport } from './computed';
import type { ReportInputs } from './inputs';
import { riskBlocks } from './riskBlocks';
import { buildRisksTask, buildTasks, parseChapterText, parseRisks, type TaskSpec } from './tasks';

export type TaskOutcome =
  | { readonly ok: true; readonly text: string; readonly model: string; readonly searched: readonly ToolCallRecord[]; readonly sources: readonly SourceRef[] }
  | { readonly ok: false; readonly error: string };

export interface RunDeps {
  /** One model call; never throws (a failure is `{ ok: false }`). */
  readonly generate: (task: TaskSpec) => Promise<TaskOutcome>;
  /** Passages from the indexed news, filings and notes for a query; never throws. */
  readonly retrieve: (query: string) => Promise<readonly GroundingPassage[]>;
  readonly now: () => Date;
}

const DEFAULT_CONCURRENCY = 2;
export const DISCLAIMER = 'This is a synthesis of public data, not investment advice.';

const written = (id: ChapterId, base: ReportChapter, over: Partial<ReportChapter>): ReportChapter => ({ ...base, id, ...over });

export async function* runReport(inputs: ReportInputs, deps: RunDeps, opts: { concurrency?: number } = {}): AsyncGenerator<ReportEvent> {
  const computed = computeReport(inputs);
  const chapters = new Map<ChapterId, ReportChapter>(CHAPTERS.map((c) => [c.id, pendingChapter(c.id, computed.blocks[c.id])]));
  const set = (chapter: ReportChapter) => chapters.set(chapter.id, chapter);

  yield { type: 'start', symbol: inputs.symbol, name: inputs.company.name, chapters: CHAPTERS.map(({ id, title }) => ({ id, title })) };
  // The figures are known already: show them before any model call returns.
  for (const { id } of CHAPTERS) if (chapters.get(id)!.blocks.length > 0) yield { type: 'chapter', chapter: chapters.get(id)! };

  const groundingTasks = ['business', 'numbers', 'sector', 'legal'] as const;
  const queries = buildTasks(inputs, computed, { business: [], numbers: [], sector: [], legal: [] });
  const retrieved = await Promise.all(queries.map((t) => deps.retrieve(t.groundingQuery)));
  const grounding = Object.fromEntries(groundingTasks.map((id, i) => [id, retrieved[i] ?? []])) as Record<(typeof groundingTasks)[number], readonly GroundingPassage[]>;
  const tasks = buildTasks(inputs, computed, grounding);

  const prose: Partial<Record<ChapterId, string>> = {};
  let model: string | null = null;
  let firstError: string | null = null;

  const settle = (task: TaskSpec, outcome: TaskOutcome): ReportChapter[] => {
    if (!outcome.ok) {
      firstError ??= outcome.error;
      return task.chapters.map((id) => written(id, chapters.get(id)!, { status: 'failed', note: outcome.error }));
    }
    model ??= outcome.model;
    const texts = parseChapterText(outcome.text, task.chapters);
    return task.chapters.map((id) => {
      const text = texts[id];
      if (text) prose[id] = text;
      return text
        ? written(id, chapters.get(id)!, { status: 'ready', prose: text, searched: outcome.searched, sources: outcome.sources })
        : written(id, chapters.get(id)!, { status: 'failed', note: 'The model did not write this chapter.', searched: outcome.searched, sources: outcome.sources });
    });
  };

  const limit = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const queue = [...tasks];
  const inFlight = new Map<string, Promise<{ id: string; task: TaskSpec; outcome: TaskOutcome }>>();
  const launch = () => {
    while (inFlight.size < limit && queue.length > 0) {
      const task = queue.shift() as TaskSpec;
      inFlight.set(task.id, deps.generate(task).then((outcome) => ({ id: task.id, task, outcome })));
    }
  };
  launch();
  while (inFlight.size > 0) {
    const done = await Promise.race(inFlight.values());
    inFlight.delete(done.id);
    for (const chapter of settle(done.task, done.outcome)) {
      set(chapter);
      yield { type: 'chapter', chapter };
    }
    launch();
  }

  if (model === null) {
    yield { type: 'error', message: firstError ?? 'The report could not be written.' };
    return;
  }

  const risks = await deps.generate(buildRisksTask(inputs, computed, prose));
  if (risks.ok) {
    const register = parseRisks(risks.text);
    set(written('risks', chapters.get('risks')!, register ? { status: 'ready', blocks: riskBlocks(register) } : { status: 'ready', prose: risks.text.trim() }));
  } else {
    set(written('risks', chapters.get('risks')!, { status: 'failed', note: risks.error }));
  }
  yield { type: 'chapter', chapter: chapters.get('risks')! };

  const generatedAt = deps.now().toISOString();
  const markdown = chaptersToMarkdown([...chapters.values()]);
  yield {
    type: 'done',
    model,
    generatedAt,
    content: `${markdown}\n\n${DISCLAIMER}`,
    note: suggestNote({ type: 'company', symbol: inputs.symbol, name: inputs.company.name }, generatedAt),
  };
}


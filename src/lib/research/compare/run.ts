// Runs the head-to-head report (#394): the computed chapters first, then the searching calls with limited concurrency, each chapter
// streamed as its call finishes; the verdict next, written from what the others found; the questions last; then one extraction for the
// structured extras. Same events as the other reports.

import type { GroundingPassage } from '@/lib/rag/insightContext';
import { COMPARE_CHAPTERS, chaptersToMarkdown, pendingChapter, type CompareChapterId, type ReportChapter, type ReportEvent } from '../report/chapters';
import { numberedItems } from '../report/plainText';
import { DISCLAIMER, type TaskOutcome } from '../report/run';
import { parseChapterText } from '../report/tasks';
import { suggestNote } from '../saveNote';
import { checklistCards } from '../sector/structure';
import type { CompareCompany } from './analysis';
import { matrixBlocks, trajectoryBlocks, valuationBlocks, verdictBlocks } from './blocks';
import { buildStructureTask, parseStructure, structureBlocks } from './structure';
import { LATER_TASKS, buildCompareTasks, buildQuestionsTask, withFindings, type CompareTask } from './tasks';

export interface CompareRunDeps {
  /** One model call; never throws (a failure is `{ ok: false }`). */
  readonly generate: (task: CompareTask) => Promise<TaskOutcome>;
  /** Passages from the indexed news, filings and notes for a query; never throws. */
  readonly retrieve: (query: string) => Promise<readonly GroundingPassage[]>;
  readonly now: () => Date;
}

const DEFAULT_CONCURRENCY = 2;
const written = (base: ReportChapter, over: Partial<ReportChapter>): ReportChapter => ({ ...base, ...over });

export async function* runCompareReport(companies: readonly CompareCompany[], deps: CompareRunDeps, opts: { concurrency?: number } = {}): AsyncGenerator<ReportEvent> {
  const blocks = { cmp_verdict: verdictBlocks(companies), cmp_trajectory: trajectoryBlocks(companies), cmp_matrix: matrixBlocks(companies), cmp_valuation: valuationBlocks(companies) };
  const chapters = new Map<CompareChapterId, ReportChapter>(COMPARE_CHAPTERS.map((c) => [c.id, pendingChapter(c.id, (blocks as Partial<Record<CompareChapterId, ReportChapter['blocks']>>)[c.id] ?? [])]));
  const title = companies.map((c) => c.symbol).join(' vs ');

  yield { type: 'start', symbol: title, name: title, chapters: COMPARE_CHAPTERS.map(({ id, title: t }) => ({ id, title: t })) };
  // The figures are known already: show them before any model call returns.
  for (const { id } of COMPARE_CHAPTERS) if (chapters.get(id)!.blocks.length > 0) yield { type: 'chapter', chapter: chapters.get(id)! };

  const empty = { business: [], issues: [], outlook: [], verdict: [] } as const;
  const queries = buildCompareTasks(companies, blocks, empty);
  const retrieved = await Promise.all(queries.map((t) => deps.retrieve(t.groundingQuery)));
  const grounding = Object.fromEntries(queries.map((t, i) => [t.id, retrieved[i] ?? []])) as Record<keyof typeof empty, readonly GroundingPassage[]>;
  const all = buildCompareTasks(companies, blocks, grounding);
  const tasks = all.filter((t) => !LATER_TASKS.includes(t.id));
  const later = all.filter((t) => LATER_TASKS.includes(t.id));

  const prose: Partial<Record<CompareChapterId, string>> = {};
  let model: string | null = null;
  let firstError: string | null = null;

  const settle = (task: CompareTask, outcome: TaskOutcome): ReportChapter[] => {
    if (!outcome.ok) {
      firstError ??= outcome.error;
      return task.chapters.map((id) => written(chapters.get(id)!, { status: 'failed', note: outcome.error }));
    }
    model ??= outcome.model;
    const texts = parseChapterText(outcome.text, task.chapters);
    return task.chapters.map((id) => {
      // The questions are one numbered list: a model that wrote each as its own block restarts every one at 1.
      const text = id === 'cmp_questions' && texts[id] ? numberedItems(texts[id]!) : texts[id];
      if (text) prose[id] = text;
      return text
        ? written(chapters.get(id)!, { status: 'ready', prose: text, searched: outcome.searched, sources: outcome.sources })
        : written(chapters.get(id)!, { status: 'failed', note: 'The model did not write this chapter.', searched: outcome.searched, sources: outcome.sources });
    });
  };
  const emit = function* (done: ReportChapter[]): Generator<ReportEvent> {
    for (const chapter of done) {
      chapters.set(chapter.id as CompareChapterId, chapter);
      yield { type: 'chapter', chapter };
    }
  };

  const limit = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const queue = [...tasks];
  const inFlight = new Map<string, Promise<{ id: string; task: CompareTask; outcome: TaskOutcome }>>();
  const launch = () => {
    while (inFlight.size < limit && queue.length > 0) {
      const task = queue.shift() as CompareTask;
      inFlight.set(task.id, deps.generate(task).then((outcome) => ({ id: task.id, task, outcome })));
    }
  };
  launch();
  while (inFlight.size > 0) {
    const done = await Promise.race(inFlight.values());
    inFlight.delete(done.id);
    yield* emit(settle(done.task, done.outcome));
    launch();
  }

  if (model === null) {
    yield { type: 'error', message: firstError ?? 'The report could not be written.' };
    return;
  }

  for (const task of later) yield* emit(settle(task, await deps.generate(withFindings(task, prose))));
  const questions = buildQuestionsTask(companies, prose);
  yield* emit(settle(questions, await deps.generate(questions)));

  // Structured extras are read from the chapters just written. They are a bonus: if the call or its reply fails, every chapter keeps
  // its text and nothing is lost. The questions become numbered cards, read from their text with no model.
  const extras = await deps.generate(buildStructureTask(companies, prose));
  const parsed = extras.ok ? parseStructure(extras.text) : null;
  const extraBlocks = parsed ? structureBlocks(parsed, companies) : {};
  const cards = prose.cmp_questions ? checklistCards(prose.cmp_questions, 'Questions that separate these companies') : null;
  if (cards) extraBlocks.cmp_questions = [cards];
  for (const [id, added] of Object.entries(extraBlocks) as [CompareChapterId, NonNullable<(typeof extraBlocks)[CompareChapterId]>][]) {
    const base = chapters.get(id);
    if (!base || base.status !== 'ready') continue;
    // The question cards replace the questions' text (they hold the same lines); the others sit above the chapter's text.
    const next = written(base, id === 'cmp_questions' ? { blocks: [...base.blocks, ...added], prose: null } : { blocks: [...base.blocks, ...added] });
    chapters.set(id, next);
    yield { type: 'chapter', chapter: next };
  }

  const generatedAt = deps.now().toISOString();
  yield {
    type: 'done',
    model,
    generatedAt,
    content: `${chaptersToMarkdown([...chapters.values()])}\n\n${DISCLAIMER}`,
    note: suggestNote({ type: 'comparison', symbols: companies.map((c) => c.symbol) }, generatedAt),
  };
}

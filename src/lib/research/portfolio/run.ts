// Runs the portfolio report (#390): the computed chapters first, then the model calls with limited concurrency, each chapter
// streamed as its call finishes, and the checklist last because it reads what the others found. Same events as the other reports.

import type { GroundingPassage } from '@/lib/rag/insightContext';
import { PORTFOLIO_CHAPTERS, chaptersToMarkdown, pendingChapter, type PortfolioChapterId, type ReportChapter, type ReportEvent } from '../report/chapters';
import { numberedItems } from '../report/plainText';
import { DISCLAIMER, type TaskOutcome } from '../report/run';
import { parseChapterText } from '../report/tasks';
import { suggestNote } from '../saveNote';
import { checklistCards } from '../sector/structure';
import { portfolioChapterBlocks } from './blocks';
import type { PortfolioInputs } from './gather';
import { LATER_TASKS, buildChecklistTask, buildPortfolioTasks, withFindings, type PortfolioTask } from './tasks';

export interface PortfolioRunDeps {
  /** One model call; never throws (a failure is `{ ok: false }`). */
  readonly generate: (task: PortfolioTask) => Promise<TaskOutcome>;
  /** Passages from the indexed news, filings and notes for a query; never throws. */
  readonly retrieve: (query: string) => Promise<readonly GroundingPassage[]>;
  readonly now: () => Date;
}

const DEFAULT_CONCURRENCY = 2;
const written = (base: ReportChapter, over: Partial<ReportChapter>): ReportChapter => ({ ...base, ...over });

export async function* runPortfolioReport(inputs: PortfolioInputs, deps: PortfolioRunDeps, opts: { concurrency?: number } = {}): AsyncGenerator<ReportEvent> {
  const { positions, omitted } = inputs;
  const blocks = portfolioChapterBlocks(positions);
  const chapters = new Map<PortfolioChapterId, ReportChapter>(
    PORTFOLIO_CHAPTERS.map((c) => [c.id, pendingChapter(c.id, (blocks as Partial<Record<PortfolioChapterId, ReportChapter['blocks']>>)[c.id] ?? [])]),
  );

  yield { type: 'start', symbol: 'My portfolio', name: 'My portfolio', chapters: PORTFOLIO_CHAPTERS.map(({ id, title }) => ({ id, title })) };
  // The figures are known already: show them before any model call returns.
  for (const { id } of PORTFOLIO_CHAPTERS) if (chapters.get(id)!.blocks.length > 0) yield { type: 'chapter', chapter: chapters.get(id)! };

  const empty = { forensics: [], attribution: [], exposure: [], risks: [] } as const;
  const queries = buildPortfolioTasks(positions, omitted, blocks, empty);
  const retrieved = await Promise.all(queries.map((t) => deps.retrieve(t.groundingQuery)));
  const grounding = Object.fromEntries(queries.map((t, i) => [t.id, retrieved[i] ?? []])) as Record<keyof typeof empty, readonly GroundingPassage[]>;
  const all = buildPortfolioTasks(positions, omitted, blocks, grounding);
  // The health chapter is written after the others, from what they found, so it cannot disagree with them.
  const tasks = all.filter((t) => !LATER_TASKS.includes(t.id));
  const later = all.filter((t) => LATER_TASKS.includes(t.id));

  const prose: Partial<Record<PortfolioChapterId, string>> = {};
  let model: string | null = null;
  let firstError: string | null = null;

  const settle = (task: PortfolioTask, outcome: TaskOutcome): ReportChapter[] => {
    if (!outcome.ok) {
      firstError ??= outcome.error;
      return task.chapters.map((id) => written(chapters.get(id)!, { status: 'failed', note: outcome.error }));
    }
    model ??= outcome.model;
    const texts = parseChapterText(outcome.text, task.chapters);
    return task.chapters.map((id) => {
      // The checklist is one numbered list: a model that wrote each item as its own block restarts every item at 1.
      const text = id === 'pf_checklist' && texts[id] ? numberedItems(texts[id]!) : texts[id];
      if (text) prose[id] = text;
      return text
        ? written(chapters.get(id)!, { status: 'ready', prose: text, searched: outcome.searched, sources: outcome.sources })
        : written(chapters.get(id)!, { status: 'failed', note: 'The model did not write this chapter.', searched: outcome.searched, sources: outcome.sources });
    });
  };

  const limit = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const queue = [...tasks];
  const inFlight = new Map<string, Promise<{ id: string; task: PortfolioTask; outcome: TaskOutcome }>>();
  const launch = () => {
    while (inFlight.size < limit && queue.length > 0) {
      const task = queue.shift() as PortfolioTask;
      inFlight.set(task.id, deps.generate(task).then((outcome) => ({ id: task.id, task, outcome })));
    }
  };
  launch();
  while (inFlight.size > 0) {
    const done = await Promise.race(inFlight.values());
    inFlight.delete(done.id);
    for (const chapter of settle(done.task, done.outcome)) {
      chapters.set(chapter.id as PortfolioChapterId, chapter);
      yield { type: 'chapter', chapter };
    }
    launch();
  }

  if (model === null) {
    yield { type: 'error', message: firstError ?? 'The report could not be written.' };
    return;
  }

  for (const task of later) {
    for (const chapter of settle(task, await deps.generate(withFindings(task, prose)))) {
      chapters.set(chapter.id as PortfolioChapterId, chapter);
      yield { type: 'chapter', chapter };
    }
  }

  const checklist = buildChecklistTask(positions, omitted, prose);
  for (const chapter of settle(checklist, await deps.generate(checklist))) {
    chapters.set(chapter.id as PortfolioChapterId, chapter);
    yield { type: 'chapter', chapter };
  }

  // The checklist as numbered cards, read from its text with no model; the cards replace the text, which holds the same items.
  const ready = chapters.get('pf_checklist');
  const cards = ready?.status === 'ready' && ready.prose ? checklistCards(ready.prose, 'What to check at the next review') : null;
  if (ready && cards) {
    const next = written(ready, { blocks: [...ready.blocks, cards], prose: null });
    chapters.set('pf_checklist', next);
    yield { type: 'chapter', chapter: next };
  }

  const generatedAt = deps.now().toISOString();
  yield {
    type: 'done',
    model,
    generatedAt,
    content: `${chaptersToMarkdown([...chapters.values()])}\n\n${DISCLAIMER}`,
    note: suggestNote({ type: 'portfolio' }, generatedAt),
  };
}

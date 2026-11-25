// Runs the sector report (#380): the computed chapters first, then the model calls with limited concurrency, each chapter
// streamed as its call finishes, and the checklist last because it reads what the others found. Same events as the company report.

import type { GroundingPassage } from '@/lib/rag/insightContext';
import { SECTOR_CHAPTERS, chaptersToMarkdown, pendingChapter, type ReportChapter, type ReportEvent, type SectorChapterId } from '../report/chapters';
import { numberedItems } from '../report/plainText';
import { parseChapterText } from '../report/tasks';
import { DISCLAIMER, type TaskOutcome } from '../report/run';
import { suggestNote } from '../saveNote';
import { leadersBlocks, scorecardBlocks } from './blocks';
import type { SectorInputs } from './inputs';
import { buildChecklistTask, buildSectorTasks, type SectorTask } from './tasks';

export interface SectorRunDeps {
  /** One model call; never throws (a failure is `{ ok: false }`). */
  readonly generate: (task: SectorTask) => Promise<TaskOutcome>;
  /** Passages from the indexed news, filings and notes for a query; never throws. */
  readonly retrieve: (query: string) => Promise<readonly GroundingPassage[]>;
  readonly now: () => Date;
}

const DEFAULT_CONCURRENCY = 2;

const written = (base: ReportChapter, over: Partial<ReportChapter>): ReportChapter => ({ ...base, ...over });

export async function* runSectorReport(inputs: SectorInputs, deps: SectorRunDeps, opts: { concurrency?: number } = {}): AsyncGenerator<ReportEvent> {
  const blocks = { scorecard: scorecardBlocks(inputs), leaders: leadersBlocks(inputs) };
  const computed: Partial<Record<SectorChapterId, typeof blocks.scorecard>> = { sx_scorecard: blocks.scorecard, sx_leaders: blocks.leaders };
  const chapters = new Map<SectorChapterId, ReportChapter>(SECTOR_CHAPTERS.map((c) => [c.id, pendingChapter(c.id, computed[c.id] ?? [])]));

  yield { type: 'start', symbol: inputs.label, name: inputs.label, chapters: SECTOR_CHAPTERS.map(({ id, title }) => ({ id, title })) };
  // The figures are known already: show them before any model call returns.
  for (const { id } of SECTOR_CHAPTERS) if (chapters.get(id)!.blocks.length > 0) yield { type: 'chapter', chapter: chapters.get(id)! };

  const empty = { economics: [], numbers: [], ecosystem: [], outlook: [], risks: [] } as const;
  const queries = buildSectorTasks(inputs, blocks, empty);
  const retrieved = await Promise.all(queries.map((t) => deps.retrieve(t.groundingQuery)));
  const grounding = Object.fromEntries(queries.map((t, i) => [t.id, retrieved[i] ?? []])) as Record<keyof typeof empty, readonly GroundingPassage[]>;
  const tasks = buildSectorTasks(inputs, blocks, grounding);

  const prose: Partial<Record<SectorChapterId, string>> = {};
  let model: string | null = null;
  let firstError: string | null = null;

  const settle = (task: SectorTask, outcome: TaskOutcome): ReportChapter[] => {
    if (!outcome.ok) {
      firstError ??= outcome.error;
      return task.chapters.map((id) => written(chapters.get(id)!, { status: 'failed', note: outcome.error }));
    }
    model ??= outcome.model;
    const texts = parseChapterText(outcome.text, task.chapters);
    return task.chapters.map((id) => {
      // The checklist is one numbered list: a model that wrote each item as its own block restarts every item at 1.
      const text = id === 'sx_checklist' && texts[id] ? numberedItems(texts[id]!) : texts[id];
      if (text) prose[id] = text;
      return text
        ? written(chapters.get(id)!, { status: 'ready', prose: text, searched: outcome.searched, sources: outcome.sources })
        : written(chapters.get(id)!, { status: 'failed', note: 'The model did not write this chapter.', searched: outcome.searched, sources: outcome.sources });
    });
  };

  const limit = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const queue = [...tasks];
  const inFlight = new Map<string, Promise<{ id: string; task: SectorTask; outcome: TaskOutcome }>>();
  const launch = () => {
    while (inFlight.size < limit && queue.length > 0) {
      const task = queue.shift() as SectorTask;
      inFlight.set(task.id, deps.generate(task).then((outcome) => ({ id: task.id, task, outcome })));
    }
  };
  launch();
  while (inFlight.size > 0) {
    const done = await Promise.race(inFlight.values());
    inFlight.delete(done.id);
    for (const chapter of settle(done.task, done.outcome)) {
      chapters.set(chapter.id as SectorChapterId, chapter);
      yield { type: 'chapter', chapter };
    }
    launch();
  }

  if (model === null) {
    yield { type: 'error', message: firstError ?? 'The report could not be written.' };
    return;
  }

  const checklist = buildChecklistTask(inputs, prose);
  for (const chapter of settle(checklist, await deps.generate(checklist))) {
    chapters.set(chapter.id as SectorChapterId, chapter);
    yield { type: 'chapter', chapter };
  }

  const generatedAt = deps.now().toISOString();
  yield {
    type: 'done',
    model,
    generatedAt,
    content: `${chaptersToMarkdown([...chapters.values()])}\n\n${DISCLAIMER}`,
    note: suggestNote({ type: 'theme', text: inputs.label }, generatedAt),
  };
}

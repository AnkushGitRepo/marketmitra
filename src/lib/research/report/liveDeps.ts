import { generateInsightText } from '@/lib/ai/generate';
import type { AiConfig } from '@/lib/ai/providers';
import { generateWithSearch } from '@/lib/ai/research/generateWithSearch';
import { retrieveInsightGrounding } from '@/lib/rag/insightContext';
import type { RunDeps, TaskOutcome } from './run';
import type { TaskSpec } from './tasks';

/** A chapter call is long (several chapters and, with search, many steps); thinking models also spend part of this on hidden reasoning. */
const MAX_OUTPUT_TOKENS = 12_000;
const MAX_STEPS = 10;
const RETRIEVED_PASSAGES = 8;

/** The report's model calls and retrieval, for one user, key and company. Neither ever throws. */
export function liveRunDeps(config: AiConfig, userId: string, symbol: string): RunDeps {
  return {
    now: () => new Date(),
    retrieve: async (query) => {
      try {
        return (await retrieveInsightGrounding({ query, userId, symbol, docTypes: ['news', 'filing', 'note'], limit: RETRIEVED_PASSAGES })).passages;
      } catch {
        return [];
      }
    },
    generate: async (task: TaskSpec): Promise<TaskOutcome> => {
      if (task.search) {
        const run = await generateWithSearch(config, task.system, task.prompt, { budget: task.search, maxOutputTokens: MAX_OUTPUT_TOKENS, maxSteps: MAX_STEPS });
        return run.ok ? { ok: true, text: run.text, model: run.model, searched: run.searched, sources: run.sources } : { ok: false, error: run.error };
      }
      const run = await generateInsightText(config, task.system, task.prompt, { maxOutputTokens: MAX_OUTPUT_TOKENS });
      return run.ok ? { ok: true, text: run.text, model: run.model, searched: [], sources: [] } : { ok: false, error: run.error };
    },
  };
}

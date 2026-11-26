import { generateInsightText } from '@/lib/ai/generate';
import type { AiConfig } from '@/lib/ai/providers';
import { generateWithSearch } from '@/lib/ai/research/generateWithSearch';
import { getCompany, getFinancials, getRatios, searchSymbols } from '@/lib/dashboard/fundamentalsApi';
import { runScreenerPage } from '@/lib/dashboard/screener';
import { retrieveInsightGrounding } from '@/lib/rag/insightContext';
import { resolveSymbol } from '../resolveSymbol';
import type { TaskOutcome } from '../report/run';
import type { CompareGetters } from './gather';
import type { CompareRunDeps } from './run';
import type { CompareTask } from './tasks';

/** A chapter call is long (with search, many steps); thinking models also spend part of this on hidden reasoning. */
const MAX_OUTPUT_TOKENS = 14_000;
const MAX_STEPS = 10;
const RETRIEVED_PASSAGES = 8;

/** The data a comparison reads. */
export const liveCompareGetters = (): CompareGetters => ({
  resolve: (raw) => resolveSymbol(raw, { getCompany, searchSymbols }),
  company: getCompany,
  ratios: getRatios,
  profitAndLoss: (symbol) => getFinancials(symbol, 'profit_and_loss'),
  page: runScreenerPage,
});

/** The comparison's model calls and retrieval, for one user and key. Neither ever throws. */
export function liveCompareDeps(config: AiConfig, userId: string): CompareRunDeps {
  return {
    now: () => new Date(),
    retrieve: async (query) => {
      try {
        return (await retrieveInsightGrounding({ query, userId, docTypes: ['news', 'filing', 'note'], limit: RETRIEVED_PASSAGES })).passages;
      } catch {
        return [];
      }
    },
    generate: async (task: CompareTask): Promise<TaskOutcome> => {
      if (task.search) {
        const run = await generateWithSearch(config, task.system, task.prompt, { budget: task.search, maxOutputTokens: MAX_OUTPUT_TOKENS, maxSteps: MAX_STEPS });
        return run.ok ? { ok: true, text: run.text, model: run.model, searched: run.searched, sources: run.sources } : { ok: false, error: run.error };
      }
      const run = await generateInsightText(config, task.system, task.prompt, { maxOutputTokens: MAX_OUTPUT_TOKENS });
      return run.ok ? { ok: true, text: run.text, model: run.model, searched: [], sources: [] } : { ok: false, error: run.error };
    },
  };
}

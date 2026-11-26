import { generateInsightText } from '@/lib/ai/generate';
import type { AiConfig } from '@/lib/ai/providers';
import { generateWithSearch } from '@/lib/ai/research/generateWithSearch';
import { getEnrichedHoldings } from '@/lib/dashboard/enrichedHoldings';
import { getPrices } from '@/lib/dashboard/fundamentalsApi';
import { runScreenerPage } from '@/lib/dashboard/screener';
import { retrieveInsightGrounding } from '@/lib/rag/insightContext';
import { toNumber } from '../formatters';
import type { TaskOutcome } from '../report/run';
import type { PortfolioGetters } from './gather';
import type { PortfolioRunDeps } from './run';
import type { PortfolioTask } from './tasks';

/** A chapter call is long (with search, many steps); thinking models also spend part of this on hidden reasoning. */
const MAX_OUTPUT_TOKENS = 14_000;
const MAX_STEPS = 10;
const RETRIEVED_PASSAGES = 8;

/** The data a user's portfolio report reads. */
export const livePortfolioGetters = (userId: string): PortfolioGetters => ({
  holdings: () => getEnrichedHoldings(userId),
  page: runScreenerPage,
  closes: async (symbol) => {
    const prices = await getPrices(symbol, '1y');
    return prices ? prices.flatMap((p) => { const c = toNumber(p.close); return c === null ? [] : [c]; }) : null;
  },
});

/** The portfolio report's model calls and retrieval, for one user and key. Neither ever throws. */
export function livePortfolioDeps(config: AiConfig, userId: string): PortfolioRunDeps {
  return {
    now: () => new Date(),
    retrieve: async (query) => {
      try {
        return (await retrieveInsightGrounding({ query, userId, docTypes: ['news', 'filing', 'note'], limit: RETRIEVED_PASSAGES })).passages;
      } catch {
        return [];
      }
    },
    generate: async (task: PortfolioTask): Promise<TaskOutcome> => {
      if (task.search) {
        const run = await generateWithSearch(config, task.system, task.prompt, { budget: task.search, maxOutputTokens: MAX_OUTPUT_TOKENS, maxSteps: MAX_STEPS });
        return run.ok ? { ok: true, text: run.text, model: run.model, searched: run.searched, sources: run.sources } : { ok: false, error: run.error };
      }
      const run = await generateInsightText(config, task.system, task.prompt, { maxOutputTokens: MAX_OUTPUT_TOKENS });
      return run.ok ? { ok: true, text: run.text, model: run.model, searched: [], sources: [] } : { ok: false, error: run.error };
    },
  };
}

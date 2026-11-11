// The real dependencies of the analyst engine (#128): Mongo, the fundamentals data, and the user's own AI key.

import { generateInsightObject, generateInsightText } from '@/lib/ai/generate';
import { loadSignalBundle } from '@/lib/ai/stockSignalsServer';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { getDocuments } from '@/lib/dashboard/fundamentalsApi';
import { logEvent } from '@/lib/system/eventLog';
import type { EngineDeps } from './engine';
import * as store from './store';

// The memo and journal replies are short JSON, but "thinking" models spend part of the budget reasoning (see #117).
const MAX_OUTPUT_TOKENS = 12000;

export function realDeps(): EngineDeps {
  return {
    now: () => new Date(),
    getAiConfig: (userId) => getUserAiConfig(userId),
    loadData: (symbol) => loadSignalBundle(symbol),
    loadDocuments: async (symbol) => (await getDocuments(symbol).catch(() => null))?.map((d) => ({ title: d.title, url: d.url })) ?? [],
    // Schema-constrained output first (a model can ignore a plain "reply with JSON" instruction); plain text if the provider cannot do it.
    generate: async (config, system, prompt, schema) => {
      const obj = await generateInsightObject(config, system, prompt, schema, { maxOutputTokens: MAX_OUTPUT_TOKENS });
      if (obj.ok) return { ok: true, text: JSON.stringify(obj.object), model: obj.model, finishReason: obj.finishReason };
      return generateInsightText(config, system, prompt, { maxOutputTokens: MAX_OUTPUT_TOKENS });
    },
    getUsage: (userId) => store.getUsage(userId),
    bumpUsage: (userId, now) => store.bumpUsage(userId, now),
    appendJournal: store.appendJournal,
    saveDossier: (userId, symbol, dossier, watch) => store.saveDossier(userId, symbol, dossier, watch),
    saveCheck: store.saveCheck,
    setStatus: (userId, symbol, status, note) => store.setStatus(userId, symbol, status, note).then(() => undefined),
    log: (e) => logEvent({ level: 'warn', ...e }),
  };
}

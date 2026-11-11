// One model call that returns a structured brief (#125, ADR 0057). Shared by the dashboard, markets, news and IPO routes.

import { logEvent } from '@/lib/system/eventLog';
import type { BriefSpec } from './briefSpecs';
import { generateInsightText } from './generate';
import type { AiConfig } from './providers';
import { parseStructured, sanitizeTickers, serializeBrief } from './structuredBrief';

/** Thinking models spend part of the output budget on hidden reasoning; 4096 was not enough for the stock brief (#117). */
const MAX_OUTPUT_TOKENS = 12000;
const LOG_SNIPPET_CHARS = 600;
const CUT_OFF_MESSAGE = 'Mitra ran out of room before finishing. Try again, or pick a model with a larger output limit.';

export interface StructuredRequest {
  aiConfig: AiConfig;
  system: string;
  prompt: string;
  spec: BriefSpec;
  /** When given, `[TICKER]` tags for any other ticker are unwrapped, so the UI never links an invented ticker. */
  allowedTickers?: ReadonlySet<string>;
}

export async function generateStructuredBrief(req: StructuredRequest): Promise<{ content: string; model: string } | { error: string }> {
  const gen = await generateInsightText(req.aiConfig, req.system, req.prompt, { maxOutputTokens: MAX_OUTPUT_TOKENS });
  if (!gen.ok) return { error: gen.error };

  const parsed = parseStructured(gen.text, req.spec);
  const cutOff = gen.finishReason === 'length';
  if (!parsed || (cutOff && parsed.items.length < req.spec.minItems)) {
    // Key-free: only a short snippet of what the model said, so an unreadable reply can be diagnosed from the system log.
    await logEvent({
      level: 'warn',
      source: `insights:${req.spec.surface}`,
      message: parsed ? 'Brief was cut off by the output limit' : 'Brief reply could not be parsed',
      meta: { model: gen.model, finishReason: gen.finishReason, length: gen.text.length, snippet: gen.text.slice(0, LOG_SNIPPET_CHARS) },
    });
    return { error: cutOff ? CUT_OFF_MESSAGE : 'Mitra returned an answer the page could not read. Try again.' };
  }

  const allowed = req.allowedTickers;
  const items = allowed ? parsed.items.map((i) => ({ ...i, text: sanitizeTickers(i.text, allowed) })) : parsed.items;
  return { content: serializeBrief({ items }), model: gen.model };
}

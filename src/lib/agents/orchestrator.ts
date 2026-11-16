// The Phase 11 pipeline (ADR 0021). Each function is one phase so the tick
// worker (Part B) can run them across separate invocations, checkpointing
// to the `agentRuns` doc between them. All model calls go through the
// existing `generateInsightText` (BYO key, guardrailed, never throws).

import { generateInsightText } from '@/lib/ai/generate';
import type { AiConfig } from '@/lib/ai/providers';
import type { AnalystContext } from './context';
import {
  analystSystem,
  BEAR_SYSTEM,
  BULL_SYSTEM,
  CLAIMS_SYSTEM,
  SYNTHESIS_SYSTEM,
} from './prompts';
import { tradeAdviceCheck } from '@/lib/ai/decisions/screens';
import { scanForTradeActions } from './tradeActionCheck';
import {
  ANALYST_ROLES,
  type AnalystReport,
  type DebateTurn,
  type KeyClaim,
} from './types';

const ANALYST_TOKENS = 700;
const DEBATE_TOKENS = 700;
const SYNTHESIS_TOKENS = 2600;

export interface PhaseError {
  error: string;
}
export const isPhaseError = (x: unknown): x is PhaseError =>
  typeof x === 'object' && x !== null && 'error' in x;

function analystDigest(reports: AnalystReport[]): string {
  return reports
    .map((r) => `### ${r.role.replace('_', ' & ')} analyst\n${r.text}`)
    .join('\n\n');
}

function debateBlock(turns: DebateTurn[]): string {
  return turns.map((t) => `[${t.side} · round ${t.round}] ${t.text}`).join('\n\n');
}

/** Phase 1 — the four analysts, in parallel. A role whose data slice was
 *  empty short-circuits to its canned note with no LLM call. */
export async function runAnalysts(
  config: AiConfig,
  ctx: AnalystContext
): Promise<AnalystReport[] | PhaseError> {
  const results = await Promise.all(
    ANALYST_ROLES.map(async (role): Promise<AnalystReport | PhaseError> => {
      const slice = ctx[role];
      if (!slice.hadData) return { role, text: slice.text, hadData: false };
      const gen = await generateInsightText(config, analystSystem(role), slice.text, {
        maxOutputTokens: ANALYST_TOKENS,
      });
      if (!gen.ok) return { error: `${role} analyst: ${gen.error}` };
      return { role, text: gen.text, hadData: true };
    })
  );
  const err = results.find(isPhaseError);
  if (err) return err;
  return results as AnalystReport[];
}

/** Phase 2 — one debate round: bull argues, then bear argues seeing the
 *  bull's fresh turn. */
export async function runDebateRound(
  config: AiConfig,
  reports: AnalystReport[],
  prior: DebateTurn[],
  round: number,
  lessons?: string
): Promise<[DebateTurn, DebateTurn] | PhaseError> {
  const priorBlock = prior.length ? `\n\nDebate so far:\n${debateBlock(prior)}` : '';
  const lessonBlock = lessons ? `\n\n${lessons}` : '';
  const base = `Analyst reports:\n${analystDigest(reports)}${lessonBlock}${priorBlock}`;

  const bull = await generateInsightText(
    config,
    BULL_SYSTEM,
    `${base}\n\nWrite the bullish argument for round ${round}.`,
    { maxOutputTokens: DEBATE_TOKENS }
  );
  if (!bull.ok) return { error: `bull round ${round}: ${bull.error}` };
  const bullTurn: DebateTurn = { side: 'bull', round, text: bull.text };

  const bear = await generateInsightText(
    config,
    BEAR_SYSTEM,
    `${base}\n\n[bull · round ${round}] ${bull.text}\n\nWrite the bearish argument for round ${round}, engaging with the bull's points.`,
    { maxOutputTokens: DEBATE_TOKENS }
  );
  if (!bear.ok) return { error: `bear round ${round}: ${bear.error}` };

  return [bullTurn, { side: 'bear', round, text: bear.text }];
}

/** Phase 3 — the synthesis briefing, with one regenerate if the
 *  trade-action post-check trips. */
export async function runSynthesis(
  config: AiConfig,
  reports: AnalystReport[],
  debate: DebateTurn[],
  lessons?: string,
  /** A second opinion beyond the regex (a decision model): true means the draft reads as trade advice. */
  readsAsAdvice: (text: string) => Promise<boolean> = tradeAdviceCheck(config)
): Promise<{ briefing: string; regenerated: boolean } | PhaseError> {
  const lessonBlock = lessons ? `\n\n${lessons}` : '';
  const prompt = `Analyst reports:\n${analystDigest(reports)}${lessonBlock}\n\nFull debate:\n${debateBlock(debate)}`;

  let gen = await generateInsightText(config, SYNTHESIS_SYSTEM, prompt, {
    maxOutputTokens: SYNTHESIS_TOKENS,
  });
  if (!gen.ok) return { error: `synthesis: ${gen.error}` };

  if (scanForTradeActions(gen.text).ok && !(await readsAsAdvice(gen.text))) {
    return { briefing: gen.text, regenerated: false };
  }

  gen = await generateInsightText(
    config,
    `${SYNTHESIS_SYSTEM}\n\nYour previous draft used trade-action, price-target, or valuation-verdict language, which is not allowed here. Rewrite it as an assessment of the arguments only.`,
    prompt,
    { maxOutputTokens: SYNTHESIS_TOKENS }
  );
  if (!gen.ok) return { error: `synthesis (retry): ${gen.error}` };
  return { briefing: gen.text, regenerated: true };
}

/** Post-synthesis — extract the 2–4 claims the debate turned on, for the
 *  reflection loop. Best-effort: returns `[]` on any parse failure. */
export async function extractKeyClaims(
  config: AiConfig,
  briefing: string,
  debate: DebateTurn[]
): Promise<KeyClaim[]> {
  const gen = await generateInsightText(
    config,
    CLAIMS_SYSTEM,
    `Debate:\n${debateBlock(debate)}\n\nBriefing:\n${briefing}`,
    { maxOutputTokens: 400 }
  );
  if (!gen.ok) return [];
  try {
    const raw = gen.text.replace(/```json\s*|\s*```/g, '').trim();
    const parsed = JSON.parse(raw) as { keyClaims?: unknown };
    if (!Array.isArray(parsed.keyClaims)) return [];
    return parsed.keyClaims
      .filter((c): c is KeyClaim => !!c && typeof (c as KeyClaim).claim === 'string')
      .slice(0, 4)
      .map((c) => ({
        side: c.side === 'bull' || c.side === 'bear' ? c.side : 'neutral',
        claim: c.claim,
      }));
  } catch {
    return [];
  }
}

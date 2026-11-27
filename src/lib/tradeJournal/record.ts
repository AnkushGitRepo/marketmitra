// Takes a snapshot when a holding changes (#412). Best effort: the holding change has already been saved, so a
// missing quote, ratio or note leaves that field empty and a failure is logged, never thrown.

import { getQuotes, getRatios } from '@/lib/dashboard/fundamentalsApi';
import { listAlerts } from '@/lib/alerts/store';
import { listNotes } from '@/lib/notes/userNotes';
import { MAX_REASON, classifyEvent, cleanText, parseRatio, pickThesisNote, ratioNamed } from './snapshot';
import { insertSnapshot } from './store';
import type { HoldingState, JournalSnapshot } from './types';

const GUARDRAIL_TYPES = new Set(['trailing_stop', 'cumulative_drawdown']);

/** Settled value, or the fallback when the lookup failed. */
function valueOr<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === 'fulfilled' ? result.value : fallback;
}

export async function recordHoldingEvent(
  userId: string,
  symbol: string,
  before: HoldingState | null,
  after: HoldingState | null,
  reason?: string | null
): Promise<JournalSnapshot | null> {
  try {
    const sym = symbol.trim().toUpperCase();
    const [quotes, ratios, notes, alerts] = await Promise.allSettled([getQuotes([sym]), getRatios(sym), listNotes(userId), listAlerts(userId)]);

    const quote = valueOr(quotes, []).find((q) => q.symbol.toUpperCase() === sym);
    const ratioList = valueOr(ratios, null) ?? [];
    // Each type once, even if several alerts of that type exist on the symbol.
    const guardrails = [
      ...new Set(
        valueOr(alerts, [])
          .filter((a) => a.symbol === sym && a.status === 'active' && GUARDRAIL_TYPES.has(a.type))
          .map((a) => a.type)
      ),
    ].sort();

    return await insertSnapshot(
      userId,
      {
        symbol: sym,
        event: classifyEvent(before, after),
        before,
        after,
        marketPrice: parseRatio(quote?.price),
        pe: ratioNamed(ratioList, ['Stock P/E', 'P/E']),
        roce: ratioNamed(ratioList, ['ROCE', 'Return on capital employed']),
        thesis: pickThesisNote(valueOr(notes, []), sym),
        reason: cleanText(reason, MAX_REASON),
        guardrails,
      },
      new Date()
    );
  } catch (err) {
    console.error('[trade-journal] could not record the snapshot', err);
    return null;
  }
}

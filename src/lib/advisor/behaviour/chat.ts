import type { ToolSet } from 'ai';
import { getPrices } from '@/lib/dashboard/fundamentalsApi';
import { buildAdvisorChatTools } from '../chatTools';
import { isAdvisorEnabled } from '../flag';
import { BENCHMARK_SYMBOL } from '../performance/service';
import { getPolicy, hasAcknowledged } from '../policy/store';
import { assessMarket, checkCooldown, dipCooldownReply, isDipRequest, policyPromptBlock } from './guard';
import { getLastDipAt, markDipServed } from './store';

export interface AdvisorChatPlan {
  /** Appended to Mitra's system prompt. */
  systemAddendum: string;
  /** Read-only advisor tools to add to the chat toolset. */
  tools: ToolSet;
  /** For a dip question: use only the advisor tools (no screener or stock-picking tools). */
  advisorToolsOnly: boolean;
  /** A fixed reply to send instead of calling the model (cooldown in force). */
  blockedReply: string | null;
}

/** Everything the chat route needs to put Mitra on the user's policy. Null when
 * the Advisor is off, un-acknowledged, or has no policy — chat is then untouched. */
export async function prepareAdvisorChat(userId: string, userText: string, now: Date): Promise<AdvisorChatPlan | null> {
  if (!isAdvisorEnabled()) return null;
  if (!(await hasAcknowledged(userId))) return null;
  const policy = await getPolicy(userId);
  if (!policy) return null;

  const rows = await getPrices(BENCHMARK_SYMBOL, '1y').catch(() => null);
  const series = (rows ?? [])
    .map((r) => ({ date: r.trade_date, close: r.close === null ? NaN : Number(r.close) }))
    .filter((p) => Number.isFinite(p.close))
    .sort((a, b) => a.date.localeCompare(b.date));
  const market = assessMarket(series);
  const dip = isDipRequest(userText);

  let blockedReply: string | null = null;
  if (dip) {
    const cooldown = checkCooldown({
      lastDipAt: await getLastDipAt(userId),
      now: now.toISOString(),
      cooldownDays: policy.dipCooldownDays,
    });
    if (cooldown.blocked && cooldown.nextAllowedAt) {
      blockedReply = dipCooldownReply(policy, market, cooldown.nextAllowedAt);
    } else {
      await markDipServed(userId, now);
    }
  }
  return {
    systemAddendum: policyPromptBlock(policy, market, { dipRequest: dip }),
    tools: buildAdvisorChatTools(userId),
    advisorToolsOnly: dip,
    blockedReply,
  };
}

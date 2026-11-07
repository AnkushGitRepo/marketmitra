import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import { computeMonthlyPlan } from './allocation/core';
import { listEntries } from './journal/store';
import { latestMemo } from './memo/store';
import { getPerformance } from './performance/service';
import { getPolicy } from './policy/store';

// Read-only advisor tools for Mitra's chat (per-user, session-authenticated).
// None can change the policy, record anything, or place an order. They are
// deliberately NOT exposed on the anonymous /api/mcp endpoint (ADR 0019):
// a personal policy and journal must never be readable without a session.

const today = () => new Date().toISOString().slice(0, 10);

export function buildAdvisorChatTools(userId: string): ToolSet {
  return {
    advisor_policy_summary: tool({
      description: "The user's Investment Policy (target allocation, contribution, drawdown tolerance, position limits, rules). Read-only.",
      inputSchema: z.object({}),
      execute: async () => (await getPolicy(userId)) ?? { error: 'No policy saved yet.' },
    }),
    advisor_current_plan: tool({
      description: "This month's deterministic plan from the user's policy — may be 'No action this month'. Read-only; it proposes nothing is executed.",
      inputSchema: z.object({}),
      execute: async () => {
        const policy = await getPolicy(userId);
        return policy ? computeMonthlyPlan({ policy, asOf: today() }) : { error: 'No policy saved yet.' };
      },
    }),
    advisor_memo: tool({
      description: 'The latest stored research memo for an NSE symbol (business, moat, risks, thesis, kill criteria, each with citations). Read-only.',
      inputSchema: z.object({ symbol: z.string().trim().min(1).max(20) }),
      execute: async ({ symbol }) =>
        (await latestMemo(userId, symbol.toUpperCase())) ?? { error: `No memo saved for ${symbol.toUpperCase()}.` },
    }),
    advisor_journal: tool({
      description: "The user's decision journal: recorded recommendations with price, thesis, what the user did, and any fired kill criteria. Read-only.",
      inputSchema: z.object({}),
      execute: async () =>
        (await listEntries(userId, 30)).map((e) => ({
          id: e.id,
          kind: e.kind,
          symbol: e.symbol,
          date: e.createdAt.slice(0, 10),
          amountINR: e.amountINR,
          priceAtTime: e.priceAtTime,
          thesis: e.thesis,
          action: e.action,
          killFired: e.killFired.map((k) => k.description),
        })),
    }),
    advisor_performance: tool({
      description: 'Paper-trading results of every recorded recommendation versus a Nifty 50 index fund, including the trailing-benchmark warning. Read-only.',
      inputSchema: z.object({}),
      execute: async () => {
        const out = await getPerformance(userId, today());
        if (!out.ok) return { error: out.error };
        const { entries: _e, series: _s, ...summary } = out.report;
        void _e;
        void _s;
        return summary;
      },
    }),
  };
}

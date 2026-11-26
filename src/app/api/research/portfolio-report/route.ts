import { NextResponse } from 'next/server';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { getCurrentUserId } from '@/lib/currentUserId';
import { withRateLimit } from '@/lib/rateLimit';
import { gatherPortfolioInputs } from '@/lib/research/portfolio/gather';
import { livePortfolioDeps, livePortfolioGetters } from '@/lib/research/portfolio/liveDeps';
import { runPortfolioReport } from '@/lib/research/portfolio/run';
import { ndjsonResponse } from '@/lib/research/report/ndjsonResponse';

export const dynamic = 'force-dynamic';
// Several model calls, some of which search the web, so a report takes minutes (the other AI routes allow the same).
export const maxDuration = 300;

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ success: false, error, ...extra }, { status });

/** The signed-in user's portfolio report as newline-delimited JSON events (`application/x-ndjson`), one per chapter as it finishes. */
async function handlePOST(): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);

  const aiConfig = await getUserAiConfig(userId);
  if (!aiConfig) return fail('no_ai_key', 400, { hint: 'Add your AI provider key in Settings.' });

  const inputs = await gatherPortfolioInputs(livePortfolioGetters(userId));
  if (!inputs) return fail('Your portfolio has no holdings yet. Add some on the Portfolio page first.', 404);

  return ndjsonResponse(runPortfolioReport(inputs, livePortfolioDeps(aiConfig, userId)));
}

export const POST = withRateLimit(handlePOST, 'ai');

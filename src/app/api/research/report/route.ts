import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getAnnouncements, getCompany, getFinancials, getInsights, getPeers, getPrices, getRatios, getShareholding, searchSymbols } from '@/lib/dashboard/fundamentalsApi';
import { withRateLimit } from '@/lib/rateLimit';
import { ndjsonResponse } from '@/lib/research/report/ndjsonResponse';
import { gatherReportInputs } from '@/lib/research/report/gather';
import { liveRunDeps } from '@/lib/research/report/liveDeps';
import { runReport } from '@/lib/research/report/run';
import { resolveSymbol } from '@/lib/research/resolveSymbol';

export const dynamic = 'force-dynamic';
// Several model calls, some of which search the web, so a report takes minutes (the other AI routes allow the same).
export const maxDuration = 300;

const bodySchema = z.object({ symbol: z.string().trim().min(1).max(40) });
const GETTERS = { getCompany, getRatios, getFinancials, getShareholding, getPeers, getPrices, getAnnouncements, getInsights };

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ success: false, error, ...extra }, { status });

async function handlePOST(request: Request): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(parsed.error.message, 422);

  const aiConfig = await getUserAiConfig(userId);
  if (!aiConfig) return fail('no_ai_key', 400, { hint: 'Add your AI provider key in Settings.' });

  const resolved = await resolveSymbol(parsed.data.symbol, { getCompany, searchSymbols });
  if (!resolved) return fail(`No listed company matches "${parsed.data.symbol}". Try the NSE symbol, e.g. BHARTIARTL.`, 404);

  const inputs = await gatherReportInputs(resolved.symbol, GETTERS);
  if (!inputs) return fail('Could not load data for that company.', 502);

  return ndjsonResponse(runReport(inputs, liveRunDeps(aiConfig, userId, resolved.symbol)));
}

export const POST = withRateLimit(handlePOST, 'ai');

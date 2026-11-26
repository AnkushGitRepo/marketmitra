import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { getCurrentUserId } from '@/lib/currentUserId';
import { withRateLimit } from '@/lib/rateLimit';
import { gatherCompareInputs, MAX_COMPANIES, MIN_COMPANIES } from '@/lib/research/compare/gather';
import { liveCompareDeps, liveCompareGetters } from '@/lib/research/compare/liveDeps';
import { runCompareReport } from '@/lib/research/compare/run';
import { ndjsonResponse } from '@/lib/research/report/ndjsonResponse';

export const dynamic = 'force-dynamic';
// Several model calls, most of which search the web, so a report takes minutes (the other AI routes allow the same).
export const maxDuration = 300;

const bodySchema = z.object({ symbols: z.array(z.string().trim().min(1).max(40)).min(MIN_COMPANIES).max(MAX_COMPANIES) });

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ success: false, error, ...extra }, { status });

/** The head-to-head comparison as newline-delimited JSON events (`application/x-ndjson`), one per chapter as it finishes. */
async function handlePOST(request: Request): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(`Give ${MIN_COMPANIES} to ${MAX_COMPANIES} companies to compare.`, 422);

  const aiConfig = await getUserAiConfig(userId);
  if (!aiConfig) return fail('no_ai_key', 400, { hint: 'Add your AI provider key in Settings.' });

  const gathered = await gatherCompareInputs(parsed.data.symbols, liveCompareGetters());
  if ('unknown' in gathered) return fail(`No listed company matches ${gathered.unknown.map((u) => `"${u}"`).join(', ')}. Check the symbol or name.`, 404);
  if (gathered.companies.length < MIN_COMPANIES) return fail('Those are the same company. Give at least two different companies to compare.', 422);

  return ndjsonResponse(runCompareReport(gathered.companies, liveCompareDeps(aiConfig, userId)));
}

export const POST = withRateLimit(handlePOST, 'ai');

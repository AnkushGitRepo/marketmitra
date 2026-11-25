import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getScreenerFacets, runScreenerPage } from '@/lib/dashboard/screener';
import { withRateLimit } from '@/lib/rateLimit';
import { ndjsonResponse } from '@/lib/research/report/ndjsonResponse';
import { gatherSectorInputs } from '@/lib/research/sector/gather';
import { liveSectorDeps } from '@/lib/research/sector/liveDeps';
import { runSectorReport } from '@/lib/research/sector/run';

export const dynamic = 'force-dynamic';
// Several model calls, most of which search the web, so a report takes minutes (the other AI routes allow the same).
export const maxDuration = 300;

const bodySchema = z.object({ theme: z.string().trim().min(2).max(80) });

const fail = (error: string, status: number, extra: Record<string, unknown> = {}) => NextResponse.json({ success: false, error, ...extra }, { status });

/** The sector report as newline-delimited JSON events (`application/x-ndjson`), one per chapter as it finishes. */
async function handlePOST(request: Request): Promise<Response> {
  const userId = await getCurrentUserId();
  if (!userId) return fail('Not authenticated', 401);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail('Say which theme or sector to research (2 to 80 characters).', 422);

  const aiConfig = await getUserAiConfig(userId);
  if (!aiConfig) return fail('no_ai_key', 400, { hint: 'Add your AI provider key in Settings.' });

  const inputs = await gatherSectorInputs(parsed.data.theme, { facets: () => getScreenerFacets(), page: runScreenerPage });
  if (!inputs) return fail(`No listed theme or sector matches "${parsed.data.theme}". Pick one from the suggestions.`, 404);

  return ndjsonResponse(runSectorReport(inputs, liveSectorDeps(aiConfig, userId)));
}

export const POST = withRateLimit(handlePOST, 'ai');

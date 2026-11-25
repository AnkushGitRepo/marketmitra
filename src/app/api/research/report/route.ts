import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getAnnouncements, getCompany, getFinancials, getInsights, getPeers, getPrices, getRatios, getShareholding, searchSymbols } from '@/lib/dashboard/fundamentalsApi';
import { withRateLimit } from '@/lib/rateLimit';
import type { ReportEvent } from '@/lib/research/report/chapters';
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

/** The report as newline-delimited JSON events (`application/x-ndjson`), one per chapter as it finishes. */
function ndjson(events: AsyncGenerator<ReportEvent>): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of events) controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      } catch {
        const event: ReportEvent = { type: 'error', message: 'The report stopped unexpectedly. Try again.' };
        controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } });
}

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

  return ndjson(runReport(inputs, liveRunDeps(aiConfig, userId, resolved.symbol)));
}

export const POST = withRateLimit(handlePOST, 'ai');

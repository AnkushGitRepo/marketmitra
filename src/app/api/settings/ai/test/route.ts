import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rateLimit';
import { getCurrentUserId } from '@/lib/currentUserId';
import { validateAiKey } from '@/lib/ai/generate';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

/**
 * Tests the user's STORED key with a tiny request and reports how long the provider took. The key is read on the server and
 * is never part of the response: only the provider, model and the measured latency are returned.
 */
async function handlePOST() {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const config = await getUserAiConfig(userId).catch(() => null);
  if (!config) {
    return NextResponse.json({ success: false, error: 'no_ai_key', hint: 'Add your AI provider key first.' }, { status: 404 });
  }

  const started = performance.now();
  const check = await validateAiKey(config);
  const latencyMs = Math.round(performance.now() - started);

  if (!check.ok) {
    return NextResponse.json({ success: false, error: check.error, data: { provider: config.provider, latencyMs } }, { status: 400 });
  }
  return NextResponse.json({ success: true, data: { provider: config.provider, model: config.model ?? null, latencyMs } });
}

export const POST = withRateLimit(handlePOST, 'ai');

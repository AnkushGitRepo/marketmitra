import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rateLimit';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getAiConfig } from '@/lib/ai/userAiConfig';
import { resolvePromptMode } from '@/lib/ai/promptModeStore';
import { hasEnoughIpoData } from '@/lib/ai/briefPrompts';
import { getOrGenerateIpoBrief } from '@/lib/ai/ipoBrief';
import { getIpos } from '@/lib/dashboard/iposApi';

export const dynamic = 'force-dynamic';
// A thinking model can take 35 to 100 s for one brief; 300 s is this plan's maximum, so a slow generation still finishes and is cached (#162).
export const maxDuration = 300;

const bodySchema = z.object({ slug: z.string().trim().min(1).max(160), force: z.boolean().optional() });

async function handlePOST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  const { slug, force } = parsed.data;

  // IPO briefs are shared reference content — the deployment's key is
  // allowed here (ADR 0018 §5); it falls back to the requesting user's key.
  const aiConfig = await getAiConfig(userId, { allowEnv: true });
  if (!aiConfig) {
    return NextResponse.json(
      { success: false, error: 'no_ai_key', hint: 'Add your AI provider key in Settings.' },
      { status: 400 }
    );
  }

  const ipo = (await getIpos()).find((i) => i.slug === slug);
  if (!ipo) {
    return NextResponse.json({ success: false, error: 'That IPO is not in the current list.' }, { status: 404 });
  }

  if (!hasEnoughIpoData(ipo)) {
    return NextResponse.json({ success: false, error: 'There is not enough data on this IPO yet for a brief.' }, { status: 422 });
  }

  const mode = await resolvePromptMode(userId);
  const result = await getOrGenerateIpoBrief({ ipo, aiConfig, mode, userId, force });

  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 502 });
  return NextResponse.json({ success: true, data: result.insight, meta: { cached: result.cached } });
}

export const POST = withRateLimit(handlePOST, 'ai');

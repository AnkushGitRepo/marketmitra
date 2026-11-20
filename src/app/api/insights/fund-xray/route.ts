import { NextResponse } from 'next/server';
import { z } from 'zod';
import { FUND_XRAY_SPEC } from '@/lib/ai/briefSpecs';
import { buildFundXrayPrompt } from '@/lib/ai/fundXrayPrompt';
import { FUND_XRAY_SYSTEM } from '@/lib/ai/prompts';
import { generateStructuredBrief } from '@/lib/ai/structuredGenerate';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { getCurrentUserId } from '@/lib/currentUserId';
import { MAX_SCHEME_CODE, MIN_SCHEME_CODE } from '@/lib/funds/types';
import { stampWriteUp } from '@/lib/funds/xrayCache';
import { loadXray, xrayInputHash } from '@/lib/funds/xrayServer';
import { getOrGenerate } from '@/lib/insights';
import { withRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
// A thinking model can take 35 to 100 s for one brief; 300 s is this plan's maximum, so a slow generation still finishes and is cached (#162).
export const maxDuration = 300;

/** The write-up is reused for 12 hours per user and fund, so coming back to the page costs no tokens. */
const TTL_MS = 12 * 60 * 60 * 1000;
const bodySchema = z.object({
  code: z.number().int().min(MIN_SCHEME_CODE).max(MAX_SCHEME_CODE),
  force: z.boolean().optional(),
});

// Spends the caller's own AI key (BYOK) and only when they ask. Mitra words findings that were computed from real
// figures (lib/funds/xray); it never sees, and so cannot invent, a stock-level overlap.
async function handlePOST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ success: false, error: parsed.error.message }, { status: 422 });
  const { code, force } = parsed.data;

  const aiConfig = await getUserAiConfig(userId);
  if (!aiConfig) {
    return NextResponse.json({ success: false, error: 'no_ai_key', hint: 'Add your AI provider key in Settings.' }, { status: 400 });
  }

  const loaded = await loadXray(userId, code);
  if (!loaded.ok) {
    return loaded.reason === 'not_found'
      ? NextResponse.json({ success: false, error: 'No mutual fund with that scheme code.' }, { status: 404 })
      : NextResponse.json({ success: false, error: 'The mutual fund data did not answer. Try again shortly.' }, { status: 503 });
  }
  const { fund, facts } = loaded;
  const inputHash = xrayInputHash(facts.items);

  const result = await getOrGenerate({
    scope: 'fund_xray',
    key: String(code),
    userId,
    // The findings are the whole input, so the write-up is redone only when they change.
    inputHash,
    ttlMs: TTL_MS,
    force,
    generate: async () => {
      const out = await generateStructuredBrief({
        aiConfig,
        system: FUND_XRAY_SYSTEM,
        prompt: buildFundXrayPrompt(fund.base_name, facts),
        spec: FUND_XRAY_SPEC,
      });
      // The hash rides along so the page can tell a write-up made from older findings and not show it.
      return 'error' in out ? out : { content: stampWriteUp(out.content, inputHash), model: out.model };
    },
  });

  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 502 });
  return NextResponse.json({ success: true, data: result.insight, meta: { cached: result.cached } });
}

export const POST = withRateLimit(handlePOST, 'ai');

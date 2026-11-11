import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rateLimit';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getAiConfig } from '@/lib/ai/userAiConfig';
import { IPO_BRIEF_SYSTEM } from '@/lib/ai/prompts';
import { IPO_SPEC } from '@/lib/ai/briefSpecs';
import { buildIpoBriefPrompt, hasEnoughIpoData } from '@/lib/ai/briefPrompts';
import { generateStructuredBrief } from '@/lib/ai/structuredGenerate';
import { getOrGenerate, hashInput } from '@/lib/insights';
import { retrieveInsightGrounding } from '@/lib/rag/insightContext';
import { getIpos } from '@/lib/dashboard/iposApi';

export const dynamic = 'force-dynamic';
// A thinking model can take 35 to 100 s for one brief; 300 s is this plan's maximum, so a slow generation still finishes and is cached (#162).
export const maxDuration = 300;

const TTL_MS = 12 * 60 * 60 * 1000;
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

  // Shared surface — retrieve against the shared corpus only (userId: null).
  // Picks up DRHP/prospectus passages once those are indexed; today mostly
  // returns news about the company.
  const grounding = await retrieveInsightGrounding({
    query: `${ipo.name} IPO — business, offer structure, use of proceeds, risks`,
    userId: null,
    docTypes: ['filing', 'news'],
    limit: 6,
  });

  const result = await getOrGenerate({
    scope: 'ipo',
    key: slug,
    userId: null, // shared across users
    // The version marker retires pre-#125 prose briefs; GMP is rounded so a small tick does not bust the cache.
    inputHash: hashInput({
      v: 2,
      ipo: [ipo.price, ipo.ipo_size_cr, ipo.lot_size, ipo.status, ipo.subscription_times, ipo.gmp === null ? null : Math.round(ipo.gmp), ipo.listing_date],
      passages: grounding.passages.map((p) => p.text),
    }),
    ttlMs: TTL_MS,
    force,
    generate: async () => {
      const out = await generateStructuredBrief({ aiConfig, system: IPO_BRIEF_SYSTEM, prompt: buildIpoBriefPrompt(ipo, grounding.passages), spec: IPO_SPEC });
      return 'error' in out ? out : { content: out.content, model: out.model };
    },
  });

  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 502 });
  return NextResponse.json({ success: true, data: result.insight, meta: { cached: result.cached } });
}

export const POST = withRateLimit(handlePOST, 'ai');

import { NextResponse } from 'next/server';
import { withRateLimit } from '@/lib/rateLimit';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { getUserAiConfig } from '@/lib/ai/userAiConfig';
import { DASHBOARD_BRIEF_SYSTEM } from '@/lib/ai/prompts';
import { DASHBOARD_SPEC } from '@/lib/ai/briefSpecs';
import { buildDashboardBriefPrompt, buildPortfolioFacts } from '@/lib/ai/briefPrompts';
import { generateStructuredBrief } from '@/lib/ai/structuredGenerate';
import { listAlerts } from '@/lib/alerts/store';
import { getOrGenerate, hashInput } from '@/lib/insights';
import { getEnrichedHoldings } from '@/lib/dashboard/enrichedHoldings';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const TTL_MS = 6 * 60 * 60 * 1000;
const bodySchema = z.object({ force: z.boolean().optional() }).optional();

// The dashboard's AI Daily Brief (#125): three labelled items (return driver, exposure, risk trigger) written from figures computed here.
async function handlePOST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  const force = parsed.success ? parsed.data?.force : false;

  const aiConfig = await getUserAiConfig(userId);
  if (!aiConfig) {
    return NextResponse.json({ success: false, error: 'no_ai_key', hint: 'Add your AI provider key in Settings.' }, { status: 400 });
  }

  const holdings = await getEnrichedHoldings(userId);
  if (holdings.length === 0) {
    return NextResponse.json({ success: false, error: 'No holdings to analyse yet.' }, { status: 400 });
  }
  // Alerts are only used to spot ones near triggering; a failure to read them must not block the brief.
  const alerts = await listAlerts(userId).catch(() => []);
  const facts = buildPortfolioFacts(holdings, alerts);

  const result = await getOrGenerate({
    scope: 'portfolio',
    key: 'portfolio',
    userId,
    // Rounded so a one-tick move does not bust the cache; the version marker retires pre-#125 prose briefs.
    inputHash: hashInput({
      v: 2,
      day: facts.dayChangeAmount === null ? null : Math.round(facts.dayChangeAmount / 100),
      top: [facts.topContributor?.symbol, facts.topDetractor?.symbol, facts.biggestHolding?.symbol, facts.topSector?.sector],
      near: facts.alertsNear.map((a) => [a.symbol, a.threshold]),
    }),
    ttlMs: TTL_MS,
    force,
    generate: async () => {
      const out = await generateStructuredBrief({ aiConfig, system: DASHBOARD_BRIEF_SYSTEM, prompt: buildDashboardBriefPrompt(facts), spec: DASHBOARD_SPEC });
      return 'error' in out ? out : { content: out.content, model: out.model };
    },
  });

  if (!result.ok) return NextResponse.json({ success: false, error: result.error }, { status: 502 });
  return NextResponse.json({ success: true, data: result.insight, meta: { cached: result.cached } });
}

export const POST = withRateLimit(handlePOST, 'ai');

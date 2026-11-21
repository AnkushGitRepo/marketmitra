import { NextResponse } from 'next/server';
import { getOrGenerateIpoBrief } from '@/lib/ai/ipoBrief';
import { sweepIpoBriefs } from '@/lib/ai/ipoBriefSweep';
import { getAiConfig } from '@/lib/ai/userAiConfig';
import { getIpos } from '@/lib/dashboard/iposApi';
import { isHosted } from '@/lib/deployment-mode';
import { authorizeCron } from '@/lib/security/cronAuth';
import { logEvent } from '@/lib/system/eventLog';

// Pre-generates the shared (guarded) IPO brief for every open and upcoming IPO (#287), so a visitor opens one that is already written.
// Machine-to-machine: bearer CRON_SECRET, driven by `.github/workflows/ipo-briefs.yml` after each IPO refresh. A brief that is still fresh
// costs nothing (the cache answers), so running it often is cheap. Uses the deployment's key (ADR 0018 §5); a self-host with no env key
// falls back to the local user's saved key. With no key at all it does nothing.

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SOURCE = 'cron:ipo-briefs';
const CONCURRENCY = 3;
/** Stop starting briefs well before maxDuration so a running one can finish and be stored. */
const BUDGET_MS = 200_000;

async function handle(request: Request) {
  const auth = authorizeCron(request, process.env.CRON_SECRET);
  if (!auth.ok) return NextResponse.json({ success: false, error: auth.error }, { status: auth.status });

  const aiConfig = await getAiConfig(isHosted() ? null : 'local', { allowEnv: true });
  if (!aiConfig) {
    return NextResponse.json({ success: true, data: { skipped: 'No deployment AI key is configured (AI_PROVIDER and AI_API_KEY).' } });
  }

  const started = Date.now();
  const { counts, failures } = await sweepIpoBriefs(
    await getIpos(),
    {
      now: Date.now,
      generate: async (ipo) => {
        const result = await getOrGenerateIpoBrief({ ipo, aiConfig, mode: 'guarded', userId: null });
        return result.ok ? { ok: true, cached: result.cached } : { ok: false, error: result.error };
      },
    },
    { concurrency: CONCURRENCY, deadline: started + BUDGET_MS }
  );

  await logEvent({
    level: failures.length > 0 ? 'warn' : 'info',
    source: SOURCE,
    message: 'IPO brief sweep finished',
    durationMs: Date.now() - started,
    meta: { ...counts, failures },
  });
  return NextResponse.json({ success: true, data: { ...counts, errors: failures } });
}

export function GET(request: Request) {
  return handle(request);
}
export function POST(request: Request) {
  return handle(request);
}

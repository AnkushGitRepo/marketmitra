import { NextResponse } from 'next/server';
import { isAdvisorEnabled } from '@/lib/advisor/flag';
import { runKillReview } from '@/lib/advisor/journal/review';
import { bearerMatches } from '@/lib/security/secrets';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// Thesis monitoring for Mitra Advisor (docs/decisions/0035). LOCAL ONLY: with
// the flag off this is a 404, and it is deliberately NOT registered in
// vercel.json or any GitHub workflow. Run it from your own scheduler, e.g.
//   curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/advisor-review

async function handle(request: Request) {
  if (!isAdvisorEnabled()) return new NextResponse(null, { status: 404 });
  const secret = process.env.CRON_SECRET;
  if (secret && !bearerMatches(request.headers.get('authorization'), secret)) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }
  const summary = await runKillReview(new Date().toISOString().slice(0, 10));
  return NextResponse.json({ success: true, data: summary });
}

export const GET = handle;
export const POST = handle;

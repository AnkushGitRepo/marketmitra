import { NextResponse } from 'next/server';
import { advisorGate } from '@/lib/advisor/guard';
import { getPolicy, savePolicy } from '@/lib/advisor/policy/store';
import { policySchema } from '@/lib/advisor/policy/schema';
import { exportPolicy } from '@/lib/advisor/policy/io';

export const dynamic = 'force-dynamic';

// GET  /api/advisor/policy            → the saved policy (null if none yet)
// GET  /api/advisor/policy?format=file → the same, as a downloadable JSON file
// PUT  /api/advisor/policy            → validate + save (also the import path:
//                                       the page parses a file, then PUTs it)

export async function GET(request: Request) {
  const gate = await advisorGate({ requireAck: true });
  if (!gate.ok) return gate.response;

  const policy = await getPolicy(gate.userId);
  if (new URL(request.url).searchParams.get('format') === 'file') {
    if (!policy) {
      return NextResponse.json({ success: false, error: 'No policy saved yet.' }, { status: 404 });
    }
    return new NextResponse(exportPolicy(policy), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': 'attachment; filename="advisor-policy.json"',
      },
    });
  }
  return NextResponse.json({ success: true, data: { policy } });
}

export async function PUT(request: Request) {
  const gate = await advisorGate({ requireAck: true });
  if (!gate.ok) return gate.response;

  const parsed = policySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: 'Invalid policy',
        issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
      { status: 422 },
    );
  }
  await savePolicy(gate.userId, parsed.data);
  return NextResponse.json({ success: true, data: { policy: parsed.data } });
}

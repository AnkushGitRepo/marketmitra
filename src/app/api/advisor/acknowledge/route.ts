import { NextResponse } from 'next/server';
import { advisorGate } from '@/lib/advisor/guard';
import { hasAcknowledged, recordAcknowledgement } from '@/lib/advisor/policy/store';
import { DISCLAIMER_VERSION } from '@/lib/advisor/disclaimer';

export const dynamic = 'force-dynamic';

export async function GET() {
  const gate = await advisorGate();
  if (!gate.ok) return gate.response;
  const accepted = await hasAcknowledged(gate.userId).catch(() => false);
  return NextResponse.json({ success: true, data: { accepted, version: DISCLAIMER_VERSION } });
}

export async function POST() {
  const gate = await advisorGate();
  if (!gate.ok) return gate.response;
  await recordAcknowledgement(gate.userId);
  return NextResponse.json({ success: true, data: { accepted: true, version: DISCLAIMER_VERSION } });
}

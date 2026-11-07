import { NextResponse } from 'next/server';
import { advisorGate } from '@/lib/advisor/guard';
import { runKillReview } from '@/lib/advisor/journal/review';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// POST /api/advisor/review — check your recorded recommendations' kill criteria now.
export async function POST() {
  const gate = await advisorGate({ requireAck: true });
  if (!gate.ok) return gate.response;
  const summary = await runKillReview(new Date().toISOString().slice(0, 10), gate.userId);
  return NextResponse.json({ success: true, data: summary });
}

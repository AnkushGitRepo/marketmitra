import { NextResponse } from 'next/server';
import { getCurrentUserId } from '@/lib/currentUserId';
import { listMitraActions } from '@/lib/mitra/activityLog';

// Read-only history of every alert Mitra has created or changed on its
// own — the guardrail hook (src/lib/alerts/guardrails.ts) and its own
// chat tools (src/lib/ai/chatTools.ts) — each with a required reason
// (ADR 0030 §4). Backs /dashboard/mitra-activity.

export async function GET() {
  const userId = await getCurrentUserId();
  if (!userId) {
    return NextResponse.json({ success: false, error: 'Not authenticated' }, { status: 401 });
  }
  const actions = await listMitraActions(userId);
  return NextResponse.json({ success: true, data: actions });
}

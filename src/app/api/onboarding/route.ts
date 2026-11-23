import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getCurrentUserId } from '@/lib/currentUserId';
import { listHoldings } from '@/lib/holdings';
import { RISK_PROFILE_IDS } from '@/lib/onboarding/profiles';
import { updatePreferences } from '@/lib/preferences/store';
import { withRateLimit } from '@/lib/rateLimit';
import { getAiSettingsView } from '@/lib/userSettings';

// First-run wizard (ADR 0075): saves the risk profile and/or how the flow ended, and answers with an honest
// summary for the launch toast. Holdings and the AI key are written by their own existing endpoints.
export const dynamic = 'force-dynamic';

const bodySchema = z
  .object({
    riskProfile: z.enum(RISK_PROFILE_IDS).optional(),
    status: z.enum(['completed', 'dismissed']).optional(),
  })
  .strict()
  .refine((b) => b.riskProfile !== undefined || b.status !== undefined, { message: 'Send a riskProfile or a status.' });

const err = (error: string, status: number) => NextResponse.json({ success: false, data: null, error }, { status });

async function handlePOST(request: Request) {
  const userId = await getCurrentUserId({ allowPat: false });
  if (!userId) return err('Not authenticated', 401);
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return err('Invalid request', 422);

  const { riskProfile, status } = parsed.data;
  let saved;
  try {
    saved = await updatePreferences(userId, {
      onboarding: {
        ...(riskProfile ? { riskProfile } : {}),
        ...(status === 'completed' ? { completed: true } : {}),
        ...(status === 'dismissed' ? { dismissed: true } : {}),
      },
    });
  } catch {
    return err('Could not save. Please try again.', 500);
  }

  // The summary is a nicety: a failed lookup shows zeros, it never fails the save that already happened.
  const [holdings, ai] = await Promise.all([listHoldings(userId).catch(() => []), getAiSettingsView(userId).catch(() => null)]);
  const hasAiKey = ai !== null;
  return NextResponse.json({
    success: true,
    data: {
      ...saved.onboarding,
      holdings: holdings.length,
      hasAiKey,
      // Analysts are created per holding but only do work with the user's own key and while the master switch is on.
      analystsQueued: hasAiKey && saved.agents.auto ? holdings.length : 0,
    },
    error: null,
  });
}

export const POST = withRateLimit(handlePOST);

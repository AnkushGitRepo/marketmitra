import { NextResponse } from 'next/server';
import { z } from 'zod';
import { sendTestEmails } from '@/emails/testSend';
import { isAdminUser } from '@/lib/auth/admin';
import { getCurrentUserId } from '@/lib/currentUserId';
import { normaliseAppUrl } from '@/emails/emails';
import { maskEmail, sendHtmlEmail } from '@/lib/email/send';
import { resolveAdminRecipient } from '@/lib/email/recipient';
import { logEvent } from '@/lib/system/eventLog';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({ id: z.string().trim().min(1).max(40) });

// Even an admin can't use this to flood an inbox: at most this many test emails per window, per process.
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 30;
const recent = new Map<string, number[]>();

function underLimit(userId: string, count: number, now: number): boolean {
  const live = (recent.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (live.length + count > MAX_PER_WINDOW) {
    recent.set(userId, live);
    return false;
  }
  recent.set(userId, [...live, ...Array.from({ length: count }, () => now)]);
  return true;
}

const err = (error: string, status: number) => NextResponse.json({ success: false, data: null, error }, { status });

/** Operator-only: sends the chosen designed email (or all) to the caller's OWN address, subject-prefixed `[TEST]`. */
export async function POST(request: Request) {
  const userId = await getCurrentUserId();
  if (!userId) return err('Not authenticated', 401);
  if (!isAdminUser(userId)) return err('Forbidden', 403);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return err('Invalid request', 422);

  const to = await resolveAdminRecipient(userId);
  if (!to) return err('No recipient: set ALERT_EMAIL_TO (self-host) or verify your account email (hosted).', 409);
  if (!underLimit(userId, parsed.data.id === 'all' ? 10 : 1, Date.now())) return err('Too many test emails. Try again in a few minutes.', 429);

  // Public URL, so images and links in a real inbox resolve (a localhost URL would show broken images).
  const appUrl = normaliseAppUrl(process.env.NEXT_PUBLIC_APP_URL);
  const results = await sendTestEmails(parsed.data.id, to, appUrl, { send: sendHtmlEmail });

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    await logEvent({ level: 'warn', source: 'email:test', message: `${failed.length} of ${results.length} test emails failed: ${failed[0].error ?? 'unknown'}` });
  }
  return NextResponse.json({ success: failed.length === 0, data: { to: maskEmail(to), results }, error: failed.length === 0 ? null : `${failed.length} of ${results.length} failed` });
}

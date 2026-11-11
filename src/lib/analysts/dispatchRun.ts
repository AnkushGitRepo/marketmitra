// Builds and delivers one user's morning dispatch (#129): in-app notification plus email, through the same fan-out the alerts use.
// Only the in-app record and email: no Slack, Telegram, WhatsApp or webhook in this phase.

import { deliverNotification, resolveEmailRoute } from '@/lib/notifications/deliver';
import { buildDispatch, DISPATCH_WINDOW_MS, renderDispatchText, type Dispatch } from './dispatch';
import { saveDispatch, setDispatchOutcome, type DispatchEmail } from './dispatchStore';
import { istDay } from './caps';
import { listAnalysts, recentEntries } from './store';

export const DISPATCH_HREF = '/agents';

/** Today's dispatch for the user, computed from their analysts and journal. Null when there is nothing worth sending. */
export async function previewDispatch(userId: string, now: Date): Promise<Dispatch | null> {
  const [analysts, entries] = await Promise.all([listAnalysts(userId), recentEntries(userId, new Date(now.getTime() - DISPATCH_WINDOW_MS))]);
  return buildDispatch(
    analysts.map((a) => ({ symbol: a.symbol, status: a.status, summary: a.dossier?.summary ?? null })),
    entries,
    now
  );
}

export interface DeliveryReport {
  email: DispatchEmail;
  detail: string | null;
}

async function deliver(userId: string, title: string, body: string): Promise<DeliveryReport> {
  const route = await resolveEmailRoute(userId);
  const { results } = await deliverNotification(userId, { kind: 'insight', title, body, href: DISPATCH_HREF, meta: { source: 'morning-dispatch' } }, route.kind === 'send' ? { email: route.to } : { email: false, emailSkipped: route.reason });
  const email = results.find((r) => r.channel === 'email');
  if (!email) return { email: 'skipped', detail: route.kind === 'skip' ? route.reason : null };
  return { email: email.status === 'sent' ? 'sent' : email.status === 'skipped' ? 'skipped' : 'failed', detail: email.detail ?? null };
}

export type RunResult = { kind: 'sent'; report: DeliveryReport } | { kind: 'nothing' } | { kind: 'already' };

/** The scheduled path: saves the brief once per India day, then delivers it. */
export async function runDispatch(userId: string, now: Date): Promise<RunResult> {
  const d = await previewDispatch(userId, now);
  if (!d) return { kind: 'nothing' };
  const body = renderDispatchText(d);
  // Claim the day first, so two overlapping runs cannot both send.
  const claimed = await saveDispatch(userId, { day: istDay(now), title: d.title, body, dispatch: d, email: 'skipped', emailDetail: 'pending' }, now);
  if (!claimed) return { kind: 'already' };
  const report = await deliver(userId, d.title, body);
  await setDispatchOutcome(userId, istDay(now), report.email, report.detail);
  return { kind: 'sent', report };
}

/** "Send test": delivers today's preview (or a short test message when nothing is material) without saving a brief or claiming the day. */
export async function sendTestDispatch(userId: string, now: Date): Promise<DeliveryReport> {
  const d = await previewDispatch(userId, now);
  if (d) return deliver(userId, `[Test] ${d.title}`, renderDispatchText(d));
  return deliver(userId, '[Test] Morning brief', 'This is a test of your morning brief. Your analysts logged nothing material in the last 24 hours, so a real brief would not be sent today.\n\nNot investment advice.');
}

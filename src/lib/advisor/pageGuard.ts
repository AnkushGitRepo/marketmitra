import { notFound } from 'next/navigation';
import { getCurrentUserId } from '@/lib/currentUserId';
import { isAdvisorEnabled } from './flag';
import { hasAcknowledged } from './policy/store';

/** Advisor pages call this first. App Router renders a layout and its page in
 * parallel, so the layout's own check is not enough to keep a page's data
 * access from running. Returns null (render nothing) until the disclaimer is
 * accepted — the layout shows the acceptance gate in that case. */
export async function advisorPageUser(): Promise<string | null> {
  if (!isAdvisorEnabled()) notFound();
  const userId = await getCurrentUserId();
  if (!userId) notFound();
  return (await hasAcknowledged(userId).catch(() => false)) ? userId : null;
}

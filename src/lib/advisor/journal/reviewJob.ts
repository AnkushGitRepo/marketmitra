import { isAdvisorEnabled } from '@/lib/advisor/flag';
import { logEvent } from '@/lib/system/eventLog';
import { runKillReview, type ReviewSummary } from './review';

/** The source the Advisor page reads to show when the thesis monitor last ran. */
export const ADVISOR_REVIEW_SOURCE = 'advisor:review';

/**
 * One thesis-monitor pass for the local user, logged so the page can say when it last ran. A no-op unless
 * the Advisor is on. A failure is logged and rethrown for the caller's own handling.
 */
export async function runAdvisorReviewJob(userId: string = 'local', now: Date = new Date()): Promise<ReviewSummary | null> {
  if (!isAdvisorEnabled()) return null;
  const started = Date.now();
  try {
    const summary = await runKillReview(now.toISOString().slice(0, 10), userId);
    await logEvent({
      level: summary.errors.length > 0 ? 'warn' : 'info',
      source: ADVISOR_REVIEW_SOURCE,
      message: `Checked ${summary.criteriaChecked} criteria on ${summary.entriesChecked} entries; ${summary.fired.length} fired`,
      durationMs: Date.now() - started,
      meta: { fired: summary.fired.length, unknown: summary.unknown, errors: summary.errors.length },
    });
    return summary;
  } catch (err: unknown) {
    await logEvent({ level: 'error', source: ADVISOR_REVIEW_SOURCE, message: `Review failed: ${err instanceof Error ? err.name : 'Error'}`, durationMs: Date.now() - started });
    throw err;
  }
}

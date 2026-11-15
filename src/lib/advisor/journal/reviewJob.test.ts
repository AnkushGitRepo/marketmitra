import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewSummary } from './review';

const enabled = vi.fn(() => true);
const review = vi.fn<(asOf: string, userId?: string) => Promise<ReviewSummary>>();
interface LogInput {
  level: string;
  source: string;
  message: string;
}
const log = vi.fn<(input: LogInput) => Promise<void>>(async () => undefined);

vi.mock('@/lib/advisor/flag', () => ({ isAdvisorEnabled: () => enabled() }));
vi.mock('./review', () => ({ runKillReview: (asOf: string, userId?: string) => review(asOf, userId) }));
vi.mock('@/lib/system/eventLog', () => ({ logEvent: (input: LogInput) => log(input) }));

const summary = (over: Partial<ReviewSummary> = {}): ReviewSummary => ({ entriesChecked: 2, criteriaChecked: 6, fired: [], unknown: 1, errors: [], ...over });

describe('runAdvisorReviewJob', () => {
  beforeEach(() => {
    enabled.mockReset();
    enabled.mockReturnValue(true);
    review.mockReset();
    log.mockClear();
  });

  it('does nothing when the Advisor is off', async () => {
    enabled.mockReturnValue(false);
    const { runAdvisorReviewJob } = await import('./reviewJob');
    expect(await runAdvisorReviewJob('local')).toBeNull();
    expect(review).not.toHaveBeenCalled();
    expect(log).not.toHaveBeenCalled();
  });

  it('reviews the given user for the given day and logs what it checked', async () => {
    review.mockResolvedValue(summary());
    const { runAdvisorReviewJob, ADVISOR_REVIEW_SOURCE } = await import('./reviewJob');
    await runAdvisorReviewJob('local', new Date('2026-11-15T10:00:00Z'));
    expect(review).toHaveBeenCalledWith('2026-11-15', 'local');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: 'info', source: ADVISOR_REVIEW_SOURCE, message: 'Checked 6 criteria on 2 entries; 0 fired' }));
  });

  it('logs a warning when some entries could not be checked', async () => {
    review.mockResolvedValue(summary({ errors: ['X: no data'] }));
    const { runAdvisorReviewJob } = await import('./reviewJob');
    await runAdvisorReviewJob('local');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn' }));
  });

  it('logs an error and rethrows when the review fails', async () => {
    review.mockRejectedValue(new Error('db down'));
    const { runAdvisorReviewJob } = await import('./reviewJob');
    await expect(runAdvisorReviewJob('local')).rejects.toThrow('db down');
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ level: 'error' }));
  });
});

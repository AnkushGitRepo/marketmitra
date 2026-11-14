import { beforeEach, describe, expect, it } from 'vitest';
import { releaseInitiate, tryClaimInitiate } from './inFlight';

beforeEach(() => {
  releaseInitiate('u1', 'ACC');
  releaseInitiate('u1', 'tcs');
});

describe('initiate in-flight guard', () => {
  it('lets the first claim through and refuses a second until it is released', () => {
    expect(tryClaimInitiate('u1', 'acc')).toBe(true);
    expect(tryClaimInitiate('u1', 'ACC')).toBe(false);
    releaseInitiate('u1', 'ACC');
    expect(tryClaimInitiate('u1', 'acc')).toBe(true);
    releaseInitiate('u1', 'acc');
  });

  it('tracks two symbols independently', () => {
    expect(tryClaimInitiate('u1', 'ACC')).toBe(true);
    expect(tryClaimInitiate('u1', 'TCS')).toBe(true);
    releaseInitiate('u1', 'ACC');
    releaseInitiate('u1', 'TCS');
  });
});

import { describe, expect, it } from 'vitest';
import { bearerMatches, secretsEqual } from './secrets';

describe('secretsEqual', () => {
  it('is true only for identical strings', () => {
    expect(secretsEqual('abc123', 'abc123')).toBe(true);
    expect(secretsEqual('abc123', 'abc124')).toBe(false);
    expect(secretsEqual('abc', 'abcd')).toBe(false); // different lengths must not throw
    expect(secretsEqual('', 'x')).toBe(false);
  });
});

describe('bearerMatches', () => {
  it('accepts exactly "Bearer <secret>"', () => {
    expect(bearerMatches('Bearer s3cret', 's3cret')).toBe(true);
  });
  it('rejects a missing, malformed or wrong header', () => {
    expect(bearerMatches(null, 's3cret')).toBe(false);
    expect(bearerMatches('', 's3cret')).toBe(false);
    expect(bearerMatches('s3cret', 's3cret')).toBe(false);
    expect(bearerMatches('bearer s3cret', 's3cret')).toBe(false);
    expect(bearerMatches('Bearer wrong', 's3cret')).toBe(false);
    expect(bearerMatches('Bearer s3cret extra', 's3cret')).toBe(false);
  });
  it('never matches when no secret is configured', () => {
    expect(bearerMatches('Bearer ', '')).toBe(false);
    expect(bearerMatches('Bearer undefined', undefined)).toBe(false);
  });
});

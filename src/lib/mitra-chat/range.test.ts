import { describe, expect, it } from 'vitest';
import { parseRange } from './range';

describe('parseRange', () => {
  it('returns null when no range is requested', () => expect(parseRange(null, 100)).toBeNull());

  it('parses closed, open-ended and suffix ranges', () => {
    expect(parseRange('bytes=0-9', 100)).toEqual({ start: 0, end: 9 });
    expect(parseRange('bytes=10-', 100)).toEqual({ start: 10, end: 99 });
    expect(parseRange('bytes=-20', 100)).toEqual({ start: 80, end: 99 });
  });

  it('clamps the end to the file size', () => expect(parseRange('bytes=90-500', 100)).toEqual({ start: 90, end: 99 }));

  it('rejects malformed, reversed and out-of-bounds ranges', () => {
    for (const h of ['bytes=', 'bytes=-', 'items=0-1', 'bytes=5-2', 'bytes=100-', 'bytes=-0', 'bytes=0-1,3-4']) {
      expect(parseRange(h, 100), h).toBe('invalid');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { makeTitle } from './title';
import { DEFAULT_TITLE, TITLE_MAX } from './limits';

describe('makeTitle', () => {
  it('uses the message, flattened and stripped of markdown', () => {
    expect(makeTitle('  How is **TCS**\n doing?  ')).toBe('How is TCS doing?');
  });

  it('falls back to the default for empty input', () => {
    expect(makeTitle('   \n ')).toBe(DEFAULT_TITLE);
    expect(makeTitle('**')).toBe(DEFAULT_TITLE);
  });

  it('truncates on a word boundary with an ellipsis within the limit', () => {
    const t = makeTitle('word '.repeat(40));
    expect(t.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(t.endsWith('…')).toBe(true);
    expect(t).not.toMatch(/wor…$/);
  });

  it('hard-cuts a single very long token', () => {
    const t = makeTitle('x'.repeat(200));
    expect(t.length).toBe(TITLE_MAX);
  });
});

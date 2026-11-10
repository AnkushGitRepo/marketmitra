import { describe, expect, it } from 'vitest';
import { formatBytes, groupByRecency, parseStoredFlag } from './uiHelpers';
import { isRetryOfLast } from './messageInput';
import type { UIMessage } from 'ai';

const NOW = new Date(2026, 10, 10, 15, 0, 0);
const at = (daysAgo: number, hour = 9) => new Date(2026, 10, 10 - daysAgo, hour, 0, 0);
const c = (id: string, updatedAt: Date) => ({ id, updatedAt });

describe('groupByRecency', () => {
  it('buckets by calendar day and omits empty groups', () => {
    const groups = groupByRecency([c('a', at(0)), c('b', at(1, 23)), c('c', at(3)), c('d', at(30))], NOW);
    expect(groups.map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Today', ['a']],
      ['Yesterday', ['b']],
      ['Previous 7 days', ['c']],
      ['Older', ['d']],
    ]);
    expect(groupByRecency([c('a', at(0))], NOW).map((g) => g.label)).toEqual(['Today']);
  });

  it('accepts ISO strings from the API and treats the 7-day edge as recent', () => {
    const groups = groupByRecency([c('a', at(7)), c('b', at(8))].map((x) => ({ ...x, updatedAt: x.updatedAt.toISOString() })), NOW);
    expect(groups.map((g) => g.label)).toEqual(['Previous 7 days', 'Older']);
  });

  it('returns nothing for no conversations', () => expect(groupByRecency([], NOW)).toEqual([]));
});

describe('formatBytes', () => {
  it('formats B, KB and MB', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(150_000)).toBe('150 KB');
    expect(formatBytes(3_500_000)).toBe('3.5 MB');
  });
});

describe('isRetryOfLast', () => {
  const m = (role: 'user' | 'assistant', id: string): UIMessage => ({ id, role, parts: [{ type: 'text', text: id }] });
  it('detects a resend of the stored last user message only', () => {
    expect(isRetryOfLast([m('assistant', 'a0'), m('user', 'u1')], m('user', 'u1'))).toBe(true);
    expect(isRetryOfLast([m('user', 'u1'), m('assistant', 'a1')], m('user', 'u1'))).toBe(false);
    expect(isRetryOfLast([m('user', 'u1')], m('user', 'u2'))).toBe(false);
    expect(isRetryOfLast([], m('user', 'u1'))).toBe(false);
  });
});

describe('parseStoredFlag', () => {
  it('is on only for an explicit "1"', () => {
    expect(parseStoredFlag('1')).toBe(true);
    expect(parseStoredFlag('0')).toBe(false);
    expect(parseStoredFlag('true')).toBe(false);
    expect(parseStoredFlag(null)).toBe(false);
  });
});

import { describe, expect, it, vi } from 'vitest';

vi.mock('./journal/store', () => ({ listEntries: vi.fn(async () => []) }));
vi.mock('./memo/store', () => ({ latestMemo: vi.fn(async () => null) }));
vi.mock('./performance/service', () => ({ getPerformance: vi.fn() }));
vi.mock('./policy/store', () => ({ getPolicy: vi.fn(async () => null) }));

import { buildAdvisorChatTools } from './chatTools';

describe('advisor chat tools', () => {
  const names = Object.keys(buildAdvisorChatTools('local'));
  it('are exactly the read-only set', () => {
    expect(names.sort()).toEqual([
      'advisor_current_plan', 'advisor_journal', 'advisor_memo', 'advisor_performance', 'advisor_policy_summary',
    ]);
  });
  it('none of them is a mutating or executing verb', () => {
    for (const n of names) expect(n).not.toMatch(/save|set|update|delete|record|place|execute|buy|sell|order/i);
  });
});

import { describe, expect, it } from 'vitest';
import { currentWriteUp, stampWriteUp } from './xrayCache';

const content = JSON.stringify({ items: [{ key: 'role', tone: 'neutral', text: 'Mitra wording.' }] });

describe('stampWriteUp', () => {
  it('records which findings the write-up was made from, and keeps its items', () => {
    const parsed = JSON.parse(stampWriteUp(content, 'abc'));
    expect(parsed.inputHash).toBe('abc');
    expect(parsed.items).toHaveLength(1);
  });

  it('leaves an unreadable answer alone rather than inventing one', () => {
    expect(stampWriteUp('not json', 'abc')).toBe('not json');
  });
});

describe('currentWriteUp', () => {
  it('returns the write-up while the findings are unchanged', () => {
    expect(currentWriteUp(stampWriteUp(content, 'abc'), 'abc')).not.toBeNull();
  });

  it('drops a write-up made from different findings, so old numbers never sit under new ones', () => {
    expect(currentWriteUp(stampWriteUp(content, 'abc'), 'xyz')).toBeNull();
  });

  it.each([null, undefined, '', 'not json', '[]', JSON.stringify({ items: [] })])('is null for %j', (raw) => {
    expect(currentWriteUp(raw, 'abc')).toBeNull();
  });

  it('is null for a write-up that has no recorded findings (older or hand-made)', () => {
    expect(currentWriteUp(content, 'abc')).toBeNull();
  });
});

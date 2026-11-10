import { describe, expect, it } from 'vitest';
import { EXPORT_VERSION, buildExportDocument, exportFilename, stripInternal } from './exportData';

const NOW = new Date('2026-11-10T10:00:00Z');
const empty = { holdings: [], notes: [], alerts: [], wishlists: [], conversations: [], preferences: {} };

describe('stripInternal', () => {
  it('removes userId at any depth and leaves the rest', () => {
    expect(stripInternal({ userId: 'u1', symbol: 'TCS', nested: [{ userId: 'u1', qty: 2 }] })).toEqual({
      symbol: 'TCS',
      nested: [{ qty: 2 }],
    });
  });

  it('turns dates into ISO strings and id-like objects into strings', () => {
    const id = { toHexString: () => 'abc', toString: () => 'abc' };
    expect(stripInternal({ at: new Date('2026-01-02T03:04:05Z'), _id: id })).toEqual({ at: '2026-01-02T03:04:05.000Z', _id: 'abc' });
  });

  it('passes primitives and null through', () => {
    expect(stripInternal(null)).toBeNull();
    expect(stripInternal(5)).toBe(5);
    expect(stripInternal('x')).toBe('x');
  });
});

describe('buildExportDocument', () => {
  it('is versioned, timestamped and carries every section', () => {
    const doc = buildExportDocument(empty, NOW);
    expect(doc).toMatchObject({ app: 'MarketMitra', version: EXPORT_VERSION, exportedAt: '2026-11-10T10:00:00.000Z' });
    for (const key of ['holdings', 'notes', 'alerts', 'wishlists', 'conversations', 'preferences']) expect(doc).toHaveProperty(key);
  });

  it('never leaks a userId, and does not mutate its input', () => {
    const parts = { ...empty, holdings: [{ userId: 'u1', symbol: 'TCS' }], conversations: [{ conversation: { userId: 'u1', title: 't' }, messages: [] }] };
    const before = JSON.stringify(parts);
    const json = JSON.stringify(buildExportDocument(parts, NOW));
    expect(json).not.toContain('userId');
    expect(json).toContain('TCS');
    expect(JSON.stringify(parts)).toBe(before);
  });
});

describe('exportFilename', () => {
  it('uses the date', () => expect(exportFilename(NOW)).toBe('marketmitra-export-2026-11-10.json'));
});

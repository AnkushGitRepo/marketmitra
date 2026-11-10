import { describe, expect, it } from 'vitest';
import { buildAccountRows, displayName, multiSessionState } from './accounts';

describe('multiSessionState', () => {
  it('reads Clerk singleSessionMode, and says unknown for anything else', () => {
    expect(multiSessionState(true)).toBe('disabled');
    expect(multiSessionState(false)).toBe('enabled');
    for (const v of [undefined, null, 'yes', 0]) expect(multiSessionState(v)).toBe('unknown');
  });
});

describe('displayName', () => {
  it('prefers the full name, then the identifier, then a neutral label', () => {
    expect(displayName({ firstName: 'Asha', lastName: 'Rao', identifier: 'a@x.com' })).toBe('Asha Rao');
    expect(displayName({ firstName: 'Asha', lastName: null, identifier: 'a@x.com' })).toBe('Asha');
    expect(displayName({ firstName: null, lastName: null, identifier: 'a@x.com' })).toBe('a@x.com');
    expect(displayName(null)).toBe('Account');
    expect(displayName(undefined)).toBe('Account');
  });
});

describe('buildAccountRows', () => {
  const s = (id: string, status = 'active', first = id) => ({ id, status, publicUserData: { firstName: first, identifier: `${id}@x.com`, imageUrl: '' } });

  it('lists only active sessions with the current account first', () => {
    const rows = buildAccountRows([s('a'), s('b'), s('c', 'ended'), s('d')], 'd');
    expect(rows.map((r) => r.id)).toEqual(['d', 'a', 'b']);
    expect(rows[0].current).toBe(true);
    expect(rows.slice(1).every((r) => !r.current)).toBe(true);
  });

  it('keeps original order when no session is current, and maps empty images to null', () => {
    const rows = buildAccountRows([s('a'), s('b')], null);
    expect(rows.map((r) => r.id)).toEqual(['a', 'b']);
    expect(rows[0].imageUrl).toBeNull();
    expect(rows[0].identifier).toBe('a@x.com');
  });

  it('does not mutate its input', () => {
    const input = [s('a'), s('b')];
    const frozen = JSON.stringify(input);
    buildAccountRows(input, 'b');
    expect(JSON.stringify(input)).toBe(frozen);
  });
});

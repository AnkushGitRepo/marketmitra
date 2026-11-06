import { describe, expect, it } from 'vitest';
import { hasClerkSession } from './clientSession';

describe('hasClerkSession', () => {
  it('is false with no cookies', () => {
    expect(hasClerkSession('')).toBe(false);
  });
  it('is false when __client_uat is 0 (signed out)', () => {
    expect(hasClerkSession('__client_uat=0; theme=dark')).toBe(false);
  });
  it('is true when __client_uat holds a timestamp', () => {
    expect(hasClerkSession('a=1; __client_uat=1700000000')).toBe(true);
  });
  it('handles Clerk\'s suffixed cookie names', () => {
    expect(hasClerkSession('__client_uat_Ab12Cd=1700000000')).toBe(true);
    expect(hasClerkSession('__client_uat=0; __client_uat_Ab12Cd=0')).toBe(false);
  });
  it('ignores unrelated cookies that merely contain the name', () => {
    expect(hasClerkSession('x__client_uat=1700000000')).toBe(false);
  });
});

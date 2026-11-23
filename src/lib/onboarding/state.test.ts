import { describe, expect, it } from 'vitest';
import { shouldOnboard } from './state';

const fresh = { completed: false, dismissed: false };

describe('shouldOnboard', () => {
  it('is true for a user with no holdings and no flags', () => {
    expect(shouldOnboard({ holdingsCount: 0, ...fresh })).toBe(true);
  });
  it('is false once completed or dismissed', () => {
    expect(shouldOnboard({ holdingsCount: 0, completed: true, dismissed: false })).toBe(false);
    expect(shouldOnboard({ holdingsCount: 0, completed: false, dismissed: true })).toBe(false);
  });
  it('is false for an existing user who already has holdings', () => {
    expect(shouldOnboard({ holdingsCount: 3, ...fresh })).toBe(false);
  });
  it('fails open when the holdings count could not be read', () => {
    expect(shouldOnboard({ holdingsCount: null, ...fresh })).toBe(false);
  });
});

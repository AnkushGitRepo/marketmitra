import { describe, expect, it } from 'vitest';
import { resolveSymbolAlias } from './symbolAliases';

describe('resolveSymbolAlias', () => {
  it('maps a common brand name to its NSE symbol', () => {
    expect(resolveSymbolAlias('airtel')).toBe('BHARTIARTL');
    expect(resolveSymbolAlias(' VI ')).toBe('IDEA');
    expect(resolveSymbolAlias('Jio')).toBe('JPL');
  });
  it('upper-cases an input that is not an alias', () => {
    expect(resolveSymbolAlias('reliance')).toBe('RELIANCE');
  });
  it('returns an empty string for blank input', () => {
    expect(resolveSymbolAlias('   ')).toBe('');
  });
});

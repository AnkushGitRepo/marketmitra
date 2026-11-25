import { describe, expect, it, vi } from 'vitest';
import { resolveSymbol } from './resolveSymbol';

const company = (name: string) => ({ name });

describe('resolveSymbol', () => {
  it('uses an alias before searching', async () => {
    const getCompany = vi.fn(async (s: string) => (s === 'BHARTIARTL' ? company('Bharti Airtel') : null));
    const search = vi.fn();
    expect(await resolveSymbol('airtel', { getCompany, searchSymbols: search })).toEqual({
      symbol: 'BHARTIARTL',
      name: 'Bharti Airtel',
    });
    expect(search).not.toHaveBeenCalled();
  });

  it('falls back to the first company hit of a search', async () => {
    const getCompany = vi.fn(async (s: string) => (s === 'TATAMOTORS' ? company('Tata Motors') : null));
    const searchSymbols = vi.fn(async () => [
      { type: 'index' as const, symbol: 'NIFTY AUTO', name: 'Nifty Auto' },
      { type: 'company' as const, symbol: 'TATAMOTORS', name: 'Tata Motors' },
    ]);
    expect(await resolveSymbol('tata motors', { getCompany, searchSymbols })).toEqual({
      symbol: 'TATAMOTORS',
      name: 'Tata Motors',
    });
  });

  it('returns null when nothing matches', async () => {
    const deps = { getCompany: vi.fn(async () => null), searchSymbols: vi.fn(async () => []) };
    expect(await resolveSymbol('zzzz', deps)).toBeNull();
  });
});

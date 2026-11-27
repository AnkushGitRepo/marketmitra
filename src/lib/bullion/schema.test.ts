import { describe, expect, it } from 'vitest';
import { createBullionSchema, entryLabel, priceRowId, updateBullionSchema } from './schema';

describe('createBullionSchema', () => {
  it('accepts gold with purity and a buy price', () => expect(createBullionSchema.safeParse({ metal: 'gold', purity: '22k', grams: 50, buyPricePerGram: 9000 }).success).toBe(true));
  it('accepts silver without a buy price', () => expect(createBullionSchema.safeParse({ metal: 'silver', grams: 500 }).success).toBe(true));
  it('rejects purity on silver and platinum', () => {
    expect(createBullionSchema.safeParse({ metal: 'silver', purity: '24k', grams: 5 }).success).toBe(false);
    expect(createBullionSchema.safeParse({ metal: 'platinum', purity: '22k', grams: 5 }).success).toBe(false);
  });
  it('rejects zero, negative, absurd and non-numeric weights', () => {
    for (const grams of [0, -5, 2_000_000, Number.NaN, '50']) expect(createBullionSchema.safeParse({ metal: 'gold', grams }).success).toBe(false);
  });
  it('rejects an unknown metal', () => expect(createBullionSchema.safeParse({ metal: 'copper', grams: 5 }).success).toBe(false));
});

describe('updateBullionSchema', () => {
  it('needs something to change', () => expect(updateBullionSchema.safeParse({}).success).toBe(false));
  it('lets a buy price be cleared with null', () => expect(updateBullionSchema.safeParse({ buyPricePerGram: null }).success).toBe(true));
});

describe('labels', () => {
  it('maps an entry to its price row and label', () => {
    expect(priceRowId({ metal: 'gold', purity: '22k' })).toBe('gold-22k');
    expect(priceRowId({ metal: 'gold', purity: null })).toBe('gold-24k');
    expect(priceRowId({ metal: 'silver', purity: null })).toBe('silver-999');
    expect(entryLabel({ metal: 'platinum', purity: null })).toBe('Platinum 999');
    expect(entryLabel({ metal: 'gold', purity: '24k' })).toBe('Gold 24K');
  });
});

import { describe, expect, it } from 'vitest';
import { checkProposal, hasProposal, holdingProposalSchema, outcomeText, parseProposalPart, requestFor, validEntry, type HoldingRow } from './holdingProposal';

const held: HoldingRow[] = [{ id: 'h1', symbol: 'TCS', quantity: 10, avgPrice: 3500 }];

describe('holdingProposalSchema', () => {
  it('normalises the symbol and needs quantity and price to add or update', () => {
    expect(holdingProposalSchema.parse({ action: 'add', symbol: ' jpl ', quantity: 40, avgPrice: 375 }).symbol).toBe('JPL');
    expect(holdingProposalSchema.safeParse({ action: 'add', symbol: 'JPL', quantity: 40 }).success).toBe(false);
    expect(holdingProposalSchema.safeParse({ action: 'update', symbol: 'TCS', avgPrice: 3600 }).success).toBe(false);
  });

  it('lets a removal carry only the symbol, and rejects bad numbers and symbols', () => {
    expect(holdingProposalSchema.safeParse({ action: 'remove', symbol: 'TCS' }).success).toBe(true);
    expect(holdingProposalSchema.safeParse({ action: 'add', symbol: 'JPL', quantity: 0, avgPrice: 375 }).success).toBe(false);
    expect(holdingProposalSchema.safeParse({ action: 'add', symbol: 'not a symbol', quantity: 1, avgPrice: 1 }).success).toBe(false);
  });
});

describe('checkProposal', () => {
  const add = holdingProposalSchema.parse({ action: 'add', symbol: 'JPL', quantity: 40, avgPrice: 375 });

  it('awaits confirmation for a new holding, an update and a removal of a held stock', () => {
    expect(checkProposal(add, held)).toMatchObject({ status: 'awaiting_confirmation', holdingId: null, current: null });
    const update = holdingProposalSchema.parse({ action: 'update', symbol: 'tcs', quantity: 12, avgPrice: 3550 });
    expect(checkProposal(update, held)).toMatchObject({ status: 'awaiting_confirmation', holdingId: 'h1', current: { quantity: 10, avgPrice: 3500 } });
    expect(checkProposal(holdingProposalSchema.parse({ action: 'remove', symbol: 'TCS' }), held)).toMatchObject({ status: 'awaiting_confirmation', holdingId: 'h1' });
  });

  it('rejects adding a stock already held and changing one that is not', () => {
    expect(checkProposal({ ...add, symbol: 'TCS' }, held)).toMatchObject({ status: 'rejected' });
    expect(checkProposal({ action: 'remove', symbol: 'JPL' }, held)).toMatchObject({ status: 'rejected' });
  });
});

describe('requestFor', () => {
  const out = (action: 'add' | 'update' | 'remove', holdingId: string | null) => ({ status: 'awaiting_confirmation' as const, action, symbol: 'JPL', holdingId, current: null });

  it('maps each action to the holdings API with the numbers the user left on the card', () => {
    expect(requestFor(out('add', null), 40, 375)).toEqual({ method: 'POST', url: '/api/holdings', body: { symbol: 'JPL', quantity: 40, avgPrice: 375 } });
    expect(requestFor(out('update', 'h1'), 12, 3550)).toEqual({ method: 'PATCH', url: '/api/holdings/h1', body: { quantity: 12, avgPrice: 3550 } });
    expect(requestFor(out('remove', 'h1'), 0, 0)).toEqual({ method: 'DELETE', url: '/api/holdings/h1', body: null });
  });
});

describe('card helpers', () => {
  it('accepts only positive finite numbers', () => {
    expect(validEntry(40, 375.5)).toBe(true);
    expect(validEntry(0, 375)).toBe(false);
    expect(validEntry(40, NaN)).toBe(false);
  });

  it('words the outcome so the next turn knows what happened', () => {
    expect(outcomeText('add', 'JPL', 'confirmed', 40, 375)).toBe('Confirmed: added JPL as 40 shares at an average of ₹375.');
    expect(outcomeText('remove', 'TCS', 'confirmed')).toContain('removed');
    expect(outcomeText('update', 'TCS', 'cancelled')).toBe('Cancelled: I did not confirm updating TCS. Nothing was changed.');
  });

  it('reads a proposal off a tool part only once it awaits confirmation', () => {
    const input = { action: 'add', symbol: 'JPL', quantity: 40, avgPrice: 375 };
    expect(parseProposalPart({ input })).toBeNull();
    expect(parseProposalPart({ input, output: { status: 'rejected', reason: 'x' } })).toBeNull();
    expect(parseProposalPart({ input, output: { status: 'awaiting_confirmation', action: 'add', symbol: 'JPL', holdingId: null, current: null } })?.proposal.symbol).toBe('JPL');
  });

  it('spots a reply that carries a holding card', () => {
    expect(hasProposal([{ type: 'text' }, { type: 'tool-propose_holding_change' }])).toBe(true);
    expect(hasProposal([{ type: 'text' }])).toBe(false);
  });
});

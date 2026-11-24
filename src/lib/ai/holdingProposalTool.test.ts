import { beforeEach, describe, expect, it, vi } from 'vitest';

const listHoldings = vi.fn();
vi.mock('@/lib/holdings', () => ({ listHoldings: (...a: unknown[]) => listHoldings(...a) }));

import { buildHoldingProposalTools } from './holdingProposalTool';
import { HOLDING_PROPOSAL_TOOL } from '@/lib/mitra-chat/holdingProposal';

type Exec = (input: unknown, opts: unknown) => Promise<unknown>;
const run = (userId: string | null, input: unknown) => (buildHoldingProposalTools(userId)[HOLDING_PROPOSAL_TOOL].execute as Exec)(input, { toolCallId: 't', messages: [] });

describe('propose_holding_change tool', () => {
  beforeEach(() => listHoldings.mockReset());

  it('only checks the proposal against the user\'s holdings and never writes', async () => {
    listHoldings.mockResolvedValue([{ id: 'h1', symbol: 'TCS', quantity: 10, avgPrice: 3500 }]);
    const out = await run('u1', { action: 'add', symbol: 'JPL', quantity: 40, avgPrice: 375 });
    expect(out).toMatchObject({ status: 'awaiting_confirmation', action: 'add', symbol: 'JPL' });
    expect(listHoldings).toHaveBeenCalledWith('u1');
  });

  it('rejects a signed-out caller without reading anything', async () => {
    expect(await run(null, { action: 'remove', symbol: 'TCS' })).toMatchObject({ status: 'rejected' });
    expect(listHoldings).not.toHaveBeenCalled();
  });
});

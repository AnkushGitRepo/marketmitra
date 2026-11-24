import { generateText, stepCountIs } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listHoldings = vi.fn();
vi.mock('@/lib/holdings', () => ({ listHoldings: (...a: unknown[]) => listHoldings(...a) }));

import { stopWhenCardShown } from '@/lib/mitra-chat/holdingProposal';
import { buildHoldingProposalTools } from './holdingProposalTool';

const usage = { inputTokens: { total: 1 }, outputTokens: { total: 1 } };

/** A model that calls the tool with `input` first, then answers in text when it gets another turn. */
function modelCalling(input: unknown) {
  let calls = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      calls += 1;
      const content = calls === 1 ? [{ type: 'tool-call', toolCallId: 'c1', toolName: 'propose_holding_change', input: JSON.stringify(input) }] : [{ type: 'text', text: 'How many shares were allotted?' }];
      return { content, finishReason: { unified: calls === 1 ? 'tool-calls' : 'stop', raw: '' }, usage, warnings: [] } as never;
    },
  });
  return { model, calls: () => calls };
}

// Guards #337: the turn ends at the card, but a proposal that cannot become a card must not end it, or the user sees nothing.
describe('propose_holding_change in the tool loop', () => {
  beforeEach(() => listHoldings.mockResolvedValue([]));
  const run = (model: MockLanguageModelV3) => generateText({ model, prompt: 'add JIO', tools: buildHoldingProposalTools('u1'), stopWhen: [stepCountIs(5), stopWhenCardShown] });

  it('stops at the card once a valid proposal is waiting for the user', async () => {
    const { model, calls } = modelCalling({ action: 'add', symbol: 'JPL', quantity: 40, avgPrice: 375 });
    const result = await run(model);
    expect(calls()).toBe(1);
    expect(result.toolResults[0]?.output).toMatchObject({ status: 'awaiting_confirmation' });
  });

  it('lets the model answer when the proposal is missing the quantity', async () => {
    const { model, calls } = modelCalling({ action: 'add', symbol: 'JPL', avgPrice: 375 });
    const result = await run(model);
    expect(calls()).toBe(2);
    expect(result.text).toContain('How many shares');
  });

  it('lets the model answer when the proposal is rejected', async () => {
    listHoldings.mockResolvedValue([{ id: 'h1', symbol: 'JPL', quantity: 5, avgPrice: 300 }]);
    const { model, calls } = modelCalling({ action: 'add', symbol: 'JPL', quantity: 40, avgPrice: 375 });
    await run(model);
    expect(calls()).toBe(2);
  });
});

import { generateText, hasToolCall, stepCountIs } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { expect, it } from 'vitest';
import { buildAskUserTools } from './askUserTool';

// Guards the SDK behaviour `stopAfterTool` relies on (#322): once the model calls ask_user the loop ends, so the model
// cannot answer its own question in the same turn.
it('stops the tool loop right after ask_user instead of letting the model continue', async () => {
  let calls = 0;
  const model = new MockLanguageModelV3({
    doGenerate: async () => {
      calls += 1;
      return {
        content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'ask_user', input: JSON.stringify({ question: 'How long will you hold?', options: [{ label: '1 year' }, { label: '5+ years' }] }) }],
        finishReason: { unified: 'tool-calls', raw: 'tool_use' },
        usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
        warnings: [],
      } as never;
    },
  });
  const result = await generateText({ model, prompt: 'Should I add more?', tools: buildAskUserTools(), stopWhen: [stepCountIs(9), hasToolCall('ask_user')] });
  expect(calls).toBe(1);
  expect(result.steps).toHaveLength(1);
  expect(result.toolResults[0]?.output).toEqual({ status: 'waiting_for_user' });
});

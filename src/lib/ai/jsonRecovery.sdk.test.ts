import { generateText, NoObjectGeneratedError, Output } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { it, expect } from 'vitest';
import { z } from 'zod';
import { recoverObject } from './jsonRecovery';
// Guards the SDK behaviour the recovery in generateInsightObject relies on (#314): a reply that is JSON in a code fence raises
// NoObjectGeneratedError with the model's text attached.
it('real SDK carries the fenced text on NoObjectGeneratedError and we can recover it', async () => {
  const schema = z.object({ symbol: z.string(), action: z.string() });
  const model = new MockLanguageModelV3({ doGenerate: async () => ({ content: [{ type: 'text', text: '```json\n{"symbol":"RELIANCE","action":"hold"}\n```' }], finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, warnings: [] }) as never });
  let err: unknown;
  try { await generateText({ model, prompt: 'x', output: Output.object({ schema }) }); } catch (e) { err = e; }
  expect(NoObjectGeneratedError.isInstance(err)).toBe(true);
  expect((err as NoObjectGeneratedError).text).toContain('RELIANCE');
  expect(recoverObject((err as NoObjectGeneratedError).text, schema)).toEqual({ symbol: 'RELIANCE', action: 'hold' });
});

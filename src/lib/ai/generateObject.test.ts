import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const generateText = vi.fn();
vi.mock('ai', async (importOriginal) => ({ ...(await importOriginal<typeof import('ai')>()), generateText: (...a: unknown[]) => generateText(...a) }));
vi.mock('./providers', async (importOriginal) => ({ ...(await importOriginal<typeof import('./providers')>()), resolveModel: () => ({}) }));

import { NoObjectGeneratedError } from 'ai';
import { generateInsightObject } from './generate';

const schema = z.object({ symbol: z.string(), action: z.enum(['hold', 'review']) });
const config = { provider: 'openrouter' as const, apiKey: 'k'.repeat(20), model: 'google/gemma-4-31b-it:free' };
const noObject = (text: string) =>
  new NoObjectGeneratedError({ message: 'No object generated: could not parse the response.', text, response: {} as never, usage: {} as never, finishReason: 'stop' });

beforeEach(() => {
  generateText.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('generateInsightObject with a fenced reply (#314)', () => {
  it('passes the object through when the model already answered cleanly', async () => {
    generateText.mockResolvedValue({ output: { symbol: 'TCS', action: 'review' }, finishReason: 'stop' });
    const r = await generateInsightObject(config, 's', 'p', schema);
    expect(r).toMatchObject({ ok: true, object: { symbol: 'TCS', action: 'review' } });
  });

  it('recovers valid JSON that the model wrapped in a markdown fence', async () => {
    generateText.mockRejectedValue(noObject('```json\n{ "symbol": "RELIANCE", "action": "hold" }\n```'));
    const r = await generateInsightObject(config, 's', 'p', schema);
    expect(r).toMatchObject({ ok: true, object: { symbol: 'RELIANCE', action: 'hold' }, model: 'google/gemma-4-31b-it:free' });
  });

  it('still fails when the fenced JSON does not match the schema', async () => {
    generateText.mockRejectedValue(noObject('```json\n{ "symbol": "RELIANCE", "action": "buy" }\n```'));
    const r = await generateInsightObject(config, 's', 'p', schema);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toMatch(/AI request failed|No object generated/);
  });

  it('still fails when the model returned no JSON at all', async () => {
    generateText.mockRejectedValue(noObject('Sorry, I cannot help with that.'));
    expect((await generateInsightObject(config, 's', 'p', schema)).ok).toBe(false);
  });

  it('does not swallow other errors', async () => {
    generateText.mockRejectedValue(Object.assign(new Error('Insufficient credits'), { statusCode: 402 }));
    const r = await generateInsightObject(config, 's', 'p', schema);
    expect(r.ok).toBe(false);
  });
});

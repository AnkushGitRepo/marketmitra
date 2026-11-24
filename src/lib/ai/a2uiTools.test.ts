import { generateText, stepCountIs } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it } from 'vitest';
import type { HoldingLike } from '@/lib/portfolio/portfolioMetrics';
import { buildA2uiTools } from './a2uiTools';
import type { SnapshotToolOutput } from './a2uiToolTypes';

const holding: HoldingLike = { symbol: 'INFY', name: 'Infosys', quantity: 10, avgPrice: 1400, ltp: 1500, sector: 'IT', dayChange: 5 };
type Executable = { execute: (a: unknown, o: unknown) => Promise<SnapshotToolOutput>; toModelOutput: (a: { output: SnapshotToolOutput }) => { type: string; value: string } };
const tool = (load: () => Promise<readonly HoldingLike[]>) => buildA2uiTools(load).show_portfolio_snapshot as unknown as Executable;

describe('show_portfolio_snapshot', () => {
  it('offers only the snapshot tool', () => {
    expect(Object.keys(buildA2uiTools(async () => []))).toEqual(['show_portfolio_snapshot']);
  });

  it('returns messages built from the real holdings', async () => {
    const out = await tool(async () => [holding]).execute({}, {});
    expect(out.shown).toBe(true);
    expect(out.messages.length).toBeGreaterThan(0);
    expect(JSON.stringify(out.messages)).toContain('INFY');
  });

  it('shows nothing, and says so to the model, when there are no holdings', async () => {
    const out = await tool(async () => []).execute({}, {});
    expect(out).toMatchObject({ shown: false, messages: [] });
    expect(out.summary).toMatch(/no holdings/i);
  });

  it('shows nothing when holdings cannot be loaded', async () => {
    const out = await tool(async () => Promise.reject(new Error('db down'))).execute({}, {});
    expect(out.shown).toBe(false);
  });

  it('gives the model the text summary, never the layout', async () => {
    const t = tool(async () => [holding]);
    const out = await t.execute({}, {});
    const modelView = t.toModelOutput({ output: out });
    expect(modelView.type).toBe('text');
    expect(modelView.value).toContain('INFY');
    expect(modelView.value).not.toContain('"component"');
  });

  it('works through the real SDK: the model is sent the summary text, not the card messages', async () => {
    const seen: string[] = [];
    let calls = 0;
    const model = new MockLanguageModelV3({
      doGenerate: async (options) => {
        calls += 1;
        seen.push(JSON.stringify(options.prompt));
        return calls === 1
          ? ({ content: [{ type: 'tool-call', toolCallId: 'c1', toolName: 'show_portfolio_snapshot', input: '{}' }], finishReason: { unified: 'tool-calls', raw: 'tool_use' }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, warnings: [] } as never)
          : ({ content: [{ type: 'text', text: 'Looks balanced.' }], finishReason: { unified: 'stop', raw: 'stop' }, usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } }, warnings: [] } as never);
      },
    });
    const result = await generateText({ model, prompt: 'How is my portfolio?', tools: buildA2uiTools(async () => [holding]), stopWhen: stepCountIs(3) });
    expect(result.text).toBe('Looks balanced.');
    expect(seen[1]).toContain('already shown to the user');
    expect(seen[1]).not.toContain('updateComponents');
    // The stored tool output keeps the messages, so the chat can draw the card.
    expect(JSON.stringify(result.steps[0].toolResults)).toContain('updateComponents');
  });
});

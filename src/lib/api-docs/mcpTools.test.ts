import { describe, expect, it } from 'vitest';
import { tools } from '@/lib/mcp/tools';
import { describeTools, firstSentence, MCP_EXAMPLE_ARGS } from './mcpTools';

describe('describeTools', () => {
  const docs = describeTools(tools);
  const byName = Object.fromEntries(docs.map((d) => [d.name, d]));

  it('documents every registered MCP tool, and has an example for each', () => {
    expect(docs.map((d) => d.name)).toEqual(tools.map((t) => t.name));
    for (const t of tools) expect(MCP_EXAMPLE_ARGS[t.name], t.name).toBeDefined();
  });

  it('derives parameter rows from the zod schema', () => {
    const q = byName.get_quote.params.find((p) => p.name === 'symbols');
    expect(q).toMatchObject({ type: 'string[]', required: true });
    expect(q?.description).toContain('NSE symbols');
  });

  it('marks defaulted and optional params as not required, and lists enums', () => {
    const period = byName.get_price_history.params.find((p) => p.name === 'period');
    expect(period?.required).toBe(false);
    expect(period?.type).toBe('"1mo" | "6mo" | "1y" | "5y"');
  });

  it('exposes defaults and a one-line summary', () => {
    const period = byName.get_price_history.params.find((p) => p.name === 'period');
    expect(period?.default).toBe('1y');
    expect(byName.get_quote.params[0].default).toBeUndefined();
    for (const d of docs) expect(d.summary.length, d.name).toBeLessThanOrEqual(110);
  });

  it('gives a no-argument tool an empty param list', () => {
    expect(byName.get_market_indices.params).toEqual([]);
  });

  it('example args only use parameters the tool declares', () => {
    for (const d of docs) {
      const known = new Set(d.params.map((p) => p.name));
      for (const key of Object.keys(d.exampleArgs)) expect(known.has(key), `${d.name}.${key}`).toBe(true);
    }
  });
});

describe('firstSentence', () => {
  it('takes the first sentence', () => expect(firstSentence('One. Two.')).toBe('One.'));
  it('does not split on a decimal or abbreviation-free dot inside a word', () =>
    expect(firstSentence('Covers ~2,570 equities (v1.2) today. More.')).toBe('Covers ~2,570 equities (v1.2) today.'));
  it('truncates long text with an ellipsis', () => {
    const out = firstSentence('x'.repeat(300), 50);
    expect(out).toHaveLength(50);
    expect(out.endsWith('…')).toBe(true);
  });
});

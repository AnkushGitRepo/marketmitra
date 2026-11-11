import { describe, expect, it } from 'vitest';
import { tools } from '@/lib/mcp/tools';
import { describeTools, MCP_EXAMPLE_ARGS } from './mcpTools';

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

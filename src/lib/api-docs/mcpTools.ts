// Turns the registered MCP tools (zod schemas) into plain, serialisable docs for the
// reference page, so the schema tables can never drift from what the server accepts.

import { z } from 'zod';
import type { McpToolDef } from '@/lib/mcp/tools';

export interface McpParamDoc {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: unknown;
}

export interface McpToolDoc {
  name: string;
  title: string;
  description: string;
  /** First sentence of the description, for the catalog list. */
  summary: string;
  params: McpParamDoc[];
  exampleArgs: Record<string, unknown>;
}

/** Hand-picked, valid arguments for the live "Run example" button (real calls, no canned output). */
export const MCP_EXAMPLE_ARGS: Readonly<Record<string, Record<string, unknown>>> = {
  search_symbols: { query: 'reliance' },
  get_quote: { symbols: ['RELIANCE', 'TCS'] },
  get_company_fundamentals: { symbol: 'TCS', sections: ['ratios'] },
  get_price_history: { symbol: 'INFY', period: '1mo' },
  get_news: { limit: 3 },
  list_ipos: { status: 'open' },
  get_market_indices: {},
  run_screener: { pe_max: 15, roe_min: 20, limit: 5 },
  get_screener_options: {},
};

/** First sentence (a dot followed by whitespace), capped with an ellipsis. */
export function firstSentence(text: string, max = 110): string {
  const m = text.match(/^[\s\S]*?[.!?](?=\s|$)/);
  const sentence = (m ? m[0] : text).trim();
  return sentence.length > max ? `${sentence.slice(0, max - 1).trimEnd()}…` : sentence;
}

interface JsonSchemaNode {
  type?: string | string[];
  enum?: unknown[];
  items?: JsonSchemaNode;
  anyOf?: JsonSchemaNode[];
  properties?: Record<string, JsonSchemaNode & { description?: string; default?: unknown }>;
  required?: string[];
}

function typeLabel(node: JsonSchemaNode): string {
  if (node.enum) return node.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (node.anyOf) return node.anyOf.map(typeLabel).join(' | ');
  const t = Array.isArray(node.type) ? node.type.join(' | ') : (node.type ?? 'unknown');
  return t === 'array' && node.items ? `${typeLabel(node.items)}[]` : t;
}

function paramsOf(schema: z.ZodTypeAny): McpParamDoc[] {
  // `io: 'input'` keeps defaulted fields optional, which is what a caller sees.
  const json = z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' }) as JsonSchemaNode;
  const required = new Set(json.required ?? []);
  return Object.entries(json.properties ?? {}).map(([name, node]) => ({
    name,
    type: typeLabel(node),
    required: required.has(name),
    description: node.description ?? '',
    ...(node.default !== undefined ? { default: node.default } : {}),
  }));
}

export function describeTools(defs: ReadonlyArray<McpToolDef<z.ZodTypeAny>>): McpToolDoc[] {
  return defs.map((t) => ({
    name: t.name,
    title: t.config.title,
    description: t.config.description,
    summary: firstSentence(t.config.description),
    params: paramsOf(t.config.inputSchema),
    exampleArgs: MCP_EXAMPLE_ARGS[t.name] ?? {},
  }));
}

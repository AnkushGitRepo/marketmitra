// Pure OpenAPI helpers + code-sample builders for the REST reference (no React).

export interface JsonSchema {
  type?: string;
  format?: string;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  minLength?: number;
  maxLength?: number;
}

export interface Param {
  name: string;
  in: 'query' | 'path';
  required?: boolean;
  description?: string;
  schema?: JsonSchema;
  example?: unknown;
}

export interface ResponseObj {
  description?: string;
  content?: Record<string, { schema?: JsonSchema; example?: unknown }>;
}

export interface Operation {
  deprecated?: boolean;
  summary?: string;
  description?: string;
  tags?: string[];
  security?: Array<Record<string, string[]>>;
  parameters?: Param[];
  requestBody?: {
    required?: boolean;
    content?: Record<string, { schema?: JsonSchema; example?: unknown }>;
  };
  responses?: Record<string, ResponseObj>;
}

export interface OpenApiSpec {
  info: { title: string; version: string; description?: string };
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, Record<string, Operation>>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, { type: string; description?: string }>;
  };
}

export type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
export const METHOD_ORDER: Method[] = ['get', 'post', 'put', 'patch', 'delete'];

export interface Endpoint {
  path: string;
  method: Method;
  op: Operation;
  id: string;
}

export function isPublic(op: Operation): boolean {
  return Array.isArray(op.security) && op.security.length === 0;
}

export function paramType(schema: JsonSchema | undefined): string {
  if (!schema) return 'string';
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (schema.type === 'array') return `${paramType(schema.items)}[]`;
  return schema.type ?? 'string';
}

export function jsonExample(op: Operation): string {
  const body = op.requestBody?.content?.['application/json'];
  if (!body) return '';
  const ex = body.example ?? exampleFromSchema(body.schema) ?? {};
  return JSON.stringify(ex, null, 2);
}

/** Synthesizes a plausible example value from a JSON Schema fragment — used
 * only where the spec has no literal `example`, so "Example Response" has
 * something concrete to show without inventing business data. */
export function exampleFromSchema(schema: JsonSchema | undefined, depth = 0): unknown {
  if (!schema || depth > 4) return null;
  if (schema.enum && schema.enum.length) return schema.enum[0];
  switch (schema.type) {
    case 'object': {
      const out: Record<string, unknown> = {};
      for (const [key, sub] of Object.entries(schema.properties ?? {})) {
        out[key] = exampleFromSchema(sub, depth + 1);
      }
      return out;
    }
    case 'array':
      return [exampleFromSchema(schema.items, depth + 1)];
    case 'number':
    case 'integer':
      return 0;
    case 'boolean':
      return true;
    case 'string':
      if (schema.format === 'date-time') return '2026-09-29T00:00:00.000Z';
      return 'string';
    default:
      return null;
  }
}

export function fmt(value: unknown): string {
  if (typeof value !== 'string') return JSON.stringify(value, null, 2);
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    // SSE (the MCP endpoint): pull the JSON out of the `data:` line(s).
    const dataLines = value
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim());
    if (dataLines.length) {
      try {
        return dataLines.map((d) => JSON.stringify(JSON.parse(d), null, 2)).join('\n\n');
      } catch {
        /* fall through */
      }
    }
    return value;
  }
}

/** Best 2xx response entry to show as "Example Response". */
export function primaryResponse(op: Operation): [string, ResponseObj] | null {
  const entries = Object.entries(op.responses ?? {});
  const ok = entries.find(([code]) => code.startsWith('2'));
  return ok ?? entries[0] ?? null;
}

// --- static example request builders (used by the Overview code samples —
// deliberately independent of the Try It Out tab's live, editable state) ---

export const DOC_HOST = 'https://your-deployment.example';

export function exampleValueFor(p: Param): string {
  if (p.example != null) return String(p.example);
  if (p.schema?.enum?.length) return String(p.schema.enum[0]);
  return p.name;
}

export function exampleUrl(path: string, op: Operation, absolute: boolean): string {
  let p = path;
  for (const pp of (op.parameters ?? []).filter((x) => x.in === 'path')) {
    p = p.replace(`{${pp.name}}`, encodeURIComponent(exampleValueFor(pp)));
  }
  const qp = (op.parameters ?? []).filter((x) => x.in === 'query' && (x.required || x.example != null));
  const qs = new URLSearchParams();
  for (const q of qp) qs.set(q.name, exampleValueFor(q));
  const query = qs.toString();
  const full = query ? `${p}?${query}` : p;
  return absolute ? `${DOC_HOST}${full}` : full;
}

export function curlSample(path: string, method: Method, op: Operation): string {
  const url = exampleUrl(path, op, true);
  const isMcp = path === '/api/mcp';
  const parts = [`curl -X ${method.toUpperCase()} '${url}'`];
  if (isMcp) parts.push(`-H 'Accept: application/json, text/event-stream'`);
  const body = jsonExample(op);
  if (body) {
    parts.push(`-H 'Content-Type: application/json'`);
    parts.push(`-d '${body.replace(/\n\s*/g, ' ')}'`);
  }
  if (!isPublic(op)) parts.push(`--cookie 'your Clerk session'`);
  return parts.join(' \\\n  ');
}

export function jsSample(path: string, method: Method, op: Operation): string {
  const url = exampleUrl(path, op, true);
  const body = jsonExample(op);
  const lines = [`const res = await fetch('${url}', {`, `  method: '${method.toUpperCase()}',`];
  if (!isPublic(op)) lines.push(`  credentials: 'include', // sends your Clerk session cookie`);
  if (body) {
    lines.push(`  headers: { 'Content-Type': 'application/json' },`);
    lines.push(`  body: JSON.stringify(${body.replace(/\n/g, '\n  ')}),`);
  }
  lines.push(`});`, `const data = await res.json();`);
  return lines.join('\n');
}

export function pySample(path: string, method: Method, op: Operation): string {
  const url = `${DOC_HOST}${path.replace(/\{[^}]+\}/g, (m) => {
    const name = m.slice(1, -1);
    const p = (op.parameters ?? []).find((x) => x.in === 'path' && x.name === name);
    return p ? exampleValueFor(p) : name;
  })}`;
  const queryParams = (op.parameters ?? []).filter(
    (x) => x.in === 'query' && (x.required || x.example != null)
  );
  const body = jsonExample(op);
  const lines = ['import requests', ''];
  const fn = method === 'get' ? 'requests.get' : `requests.${method}`;
  lines.push(`res = ${fn}(`, `    '${url}',`);
  if (queryParams.length) {
    lines.push(
      `    params={${queryParams.map((q) => `'${q.name}': '${exampleValueFor(q)}'`).join(', ')}},`
    );
  }
  if (body) {
    lines.push(`    json=${body.replace(/\n/g, '\n    ')},`);
  }
  if (!isPublic(op)) lines.push(`    cookies={'__session': 'your Clerk session'},`);
  lines.push(')', 'data = res.json()');
  return lines.join('\n');
}

export interface RunResult {
  status: number;
  statusText: string;
  ms: number;
  body: string;
  /** Unformatted response text and lower-cased headers, for check evaluation. */
  raw: string;
  headers: Record<string, string>;
  rateLimit?: string;
  ok: boolean;
}

export function listEndpoints(spec: OpenApiSpec): Endpoint[] {
  const list: Endpoint[] = [];
  for (const [path, ops] of Object.entries(spec.paths)) {
    for (const method of METHOD_ORDER) {
      const op = ops[method];
      // Deprecated aliases stay in openapi.json but would only duplicate the reference.
      if (op && !op.deprecated) list.push({ path, method, op, id: `${method.toUpperCase()} ${path}` });
    }
  }
  return list;
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './page.module.css';

// --- a deliberately small slice of OpenAPI, enough to drive the docs UI ---

interface JsonSchema {
  type?: string;
  format?: string;
  enum?: unknown[];
  items?: JsonSchema;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  minLength?: number;
  maxLength?: number;
}

interface Param {
  name: string;
  in: 'query' | 'path';
  required?: boolean;
  description?: string;
  schema?: JsonSchema;
  example?: unknown;
}

interface ResponseObj {
  description?: string;
  content?: Record<string, { schema?: JsonSchema; example?: unknown }>;
}

interface Operation {
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
}

interface McpInfo {
  serverInfo: { name: string; version: string };
  tools: Array<{ name: string; description: string }>;
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
const METHOD_ORDER: Method[] = ['get', 'post', 'put', 'patch', 'delete'];

interface Endpoint {
  path: string;
  method: Method;
  op: Operation;
  id: string;
}

function isPublic(op: Operation): boolean {
  return Array.isArray(op.security) && op.security.length === 0;
}

function paramType(schema: JsonSchema | undefined): string {
  if (!schema) return 'string';
  if (schema.enum) return schema.enum.map((v) => JSON.stringify(v)).join(' | ');
  if (schema.type === 'array') return `${paramType(schema.items)}[]`;
  return schema.type ?? 'string';
}

function jsonExample(op: Operation): string {
  const body = op.requestBody?.content?.['application/json'];
  if (!body) return '';
  const ex = body.example ?? exampleFromSchema(body.schema) ?? {};
  return JSON.stringify(ex, null, 2);
}

/** Synthesizes a plausible example value from a JSON Schema fragment — used
 * only where the spec has no literal `example`, so "Example Response" has
 * something concrete to show without inventing business data. */
function exampleFromSchema(schema: JsonSchema | undefined, depth = 0): unknown {
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

function fmt(value: unknown): string {
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
function primaryResponse(op: Operation): [string, ResponseObj] | null {
  const entries = Object.entries(op.responses ?? {});
  const ok = entries.find(([code]) => code.startsWith('2'));
  return ok ?? entries[0] ?? null;
}

// --- static example request builders (used by the Overview code samples —
// deliberately independent of the Try It Out tab's live, editable state) ---

const DOC_HOST = 'https://your-deployment.example';

function exampleValueFor(p: Param): string {
  if (p.example != null) return String(p.example);
  if (p.schema?.enum?.length) return String(p.schema.enum[0]);
  return p.name;
}

function exampleUrl(path: string, op: Operation, absolute: boolean): string {
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

function curlSample(path: string, method: Method, op: Operation): string {
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

function jsSample(path: string, method: Method, op: Operation): string {
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

function pySample(path: string, method: Method, op: Operation): string {
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

interface RunResult {
  status: number;
  statusText: string;
  ms: number;
  body: string;
  rateLimit?: string;
  ok: boolean;
}

export function ApiExplorerClient({ spec, mcp }: { spec: OpenApiSpec; mcp: McpInfo }) {
  const endpoints = useMemo<Endpoint[]>(() => {
    const list: Endpoint[] = [];
    for (const [path, ops] of Object.entries(spec.paths)) {
      for (const method of METHOD_ORDER) {
        const op = ops[method];
        if (op) list.push({ path, method, op, id: `${method.toUpperCase()} ${path}` });
      }
    }
    return list;
  }, [spec]);

  const groups = useMemo(() => {
    const byTag = new Map<string, Endpoint[]>();
    for (const ep of endpoints) {
      const tag = ep.op.tags?.[0] ?? 'Other';
      if (!byTag.has(tag)) byTag.set(tag, []);
      byTag.get(tag)!.push(ep);
    }
    return [...byTag.entries()];
  }, [endpoints]);

  const [selectedId, setSelectedId] = useState(endpoints[0]?.id ?? '');
  const selected = endpoints.find((e) => e.id === selectedId) ?? endpoints[0];

  const [collapsedTags, setCollapsedTags] = useState<Record<string, boolean>>({});
  const toggleTag = (tag: string) =>
    setCollapsedTags((c) => ({ ...c, [tag]: !c[tag] }));

  return (
    <div className={styles.explorer}>
      <AiAgentsCard spec={spec} mcp={mcp} endpoints={endpoints} />
      <McpCard mcp={mcp} />

      <div className={styles.cols}>
        <nav className={styles.sidebar} aria-label="Endpoints">
          <div className={styles.sidebarHead}>
            <p className={styles.sidebarEyebrow}>API reference</p>
            <p className={styles.sidebarMeta}>
              v{spec.info.version} &middot; {endpoints.length} endpoints
            </p>
          </div>
          {groups.map(([tag, eps]) => {
            const open = !collapsedTags[tag];
            return (
              <div key={tag} className={styles.navGroup}>
                <button
                  type="button"
                  className={styles.navGroupHead}
                  onClick={() => toggleTag(tag)}
                  aria-expanded={open}
                >
                  <span className={styles.navGroupTitle}>{tag}</span>
                  <svg
                    className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`}
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      d="M7 10l5 5 5-5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                {open &&
                  eps.map((ep) => (
                    <button
                      key={ep.id}
                      type="button"
                      className={`${styles.navRow} ${ep.id === selectedId ? styles.navRowActive : ''}`}
                      onClick={() => setSelectedId(ep.id)}
                    >
                      <span className={`${styles.method} ${styles[`m_${ep.method}`]}`}>
                        {ep.method.toUpperCase()}
                      </span>
                      <span className={styles.navPath}>{ep.path.replace('/api', '')}</span>
                    </button>
                  ))}
              </div>
            );
          })}
        </nav>

        {selected && <EndpointPanel key={selected.id} endpoint={selected} />}
      </div>
    </div>
  );
}

function SparkleIcon() {
  return (
    <svg viewBox="0 0 24 24" className={styles.sparkleIcon} aria-hidden="true">
      <path
        d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M19 15l.7 2 2 .7-2 .7-.7 2-.7-2-2-.7 2-.7.7-2z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function buildAgentPrompt(spec: OpenApiSpec, mcp: McpInfo, endpoints: Endpoint[], origin: string): string {
  const lines: string[] = [];
  lines.push(`You are working against the ${spec.info.title} (v${spec.info.version}).`);
  lines.push(`Base URL: ${origin || DOC_HOST}`);
  if (spec.info.description) lines.push(spec.info.description);
  lines.push('');
  lines.push(
    `Prefer the MCP server for read-only public market data: ${origin || DOC_HOST}/api/mcp (streamable HTTP, no auth). Tools:`
  );
  for (const t of mcp.tools) lines.push(`  - ${t.name}: ${t.description}`);
  lines.push('');
  lines.push('For anything the MCP tools don’t cover, use the REST endpoints below.');
  lines.push(
    'Public endpoints need no auth; session endpoints require the Clerk session cookie (hosted) or run open in self-host mode.'
  );
  lines.push('');
  lines.push('Endpoints:');
  for (const ep of endpoints) {
    const auth = isPublic(ep.op) ? 'public' : 'session';
    lines.push(`- ${ep.method.toUpperCase()} ${ep.path} [${auth}] ${ep.op.summary ?? ''}`.trimEnd());
    const params = (ep.op.parameters ?? [])
      .map((p) => `${p.name}${p.required ? '' : '?'}: ${paramType(p.schema)}`)
      .join(', ');
    if (params) lines.push(`    params: ${params}`);
    if (ep.op.requestBody) {
      const body = ep.op.requestBody.content?.['application/json']?.schema;
      const props = body?.properties
        ? Object.entries(body.properties)
            .map(([k, v]) => `${k}: ${paramType(v)}`)
            .join(', ')
        : 'json body';
      lines.push(`    body: { ${props} }`);
    }
  }
  return lines.join('\n');
}

function AiAgentsCard({
  spec,
  mcp,
  endpoints,
}: {
  spec: OpenApiSpec;
  mcp: McpInfo;
  endpoints: Endpoint[];
}) {
  const [dismissed, setDismissed] = useState(false);
  const [copied, setCopied] = useState(false);
  if (dismissed) return null;

  const copy = async () => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const prompt = buildAgentPrompt(spec, mcp, endpoints, origin);
    try {
      await navigator.clipboard?.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — silently ignore, button just won't confirm */
    }
  };

  return (
    <section className={styles.aiCard}>
      <div className={styles.aiCardIcon}>
        <SparkleIcon />
      </div>
      <div className={styles.aiCardBody}>
        <p className={styles.aiCardTitle}>Build with AI agents</p>
        <p className={styles.aiCardText}>
          Copy the complete API context prompt &mdash; paste it into Claude, ChatGPT, or any AI
          agent to give it full knowledge of every endpoint, schema, and usage pattern.
        </p>
      </div>
      <button type="button" className={styles.aiCardBtn} onClick={copy}>
        {copied ? 'Copied' : 'Copy prompt'}
      </button>
      <button
        type="button"
        className={styles.aiCardClose}
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        &times;
      </button>
    </section>
  );
}

function McpCard({ mcp }: { mcp: McpInfo }) {
  // Start relative so SSR and first client render match; upgrade to an
  // absolute URL after mount.
  const [url, setUrl] = useState('/api/mcp');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate: relative for SSR match, absolute after mount
    setUrl(`${window.location.origin}/api/mcp`);
  }, []);
  const config = JSON.stringify({ marketmitra: { url } }, null, 2);
  return (
    <section className={styles.mcpCard}>
      <h2 className={styles.mcpTitle}>MCP server</h2>
      <p className={styles.mcpText}>
        Streamable HTTP. Point any MCP client at <code className={styles.code}>{url}</code>. All
        tools are read-only public data &mdash; no auth, fair-use rate limited.
      </p>
      <pre className={styles.pre}>
        <code>{config}</code>
      </pre>
      <ul className={styles.toolList}>
        {mcp.tools.map((t) => {
          const brief =
            t.description.length > 96 ? `${t.description.slice(0, 96).trimEnd()}…` : t.description;
          return (
            <li key={t.name}>
              <code className={styles.code}>{t.name}</code>
              <span className={styles.toolDesc}>{brief}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ParamTable({ title, params }: { title: string; params: Param[] }) {
  if (params.length === 0) return null;
  return (
    <div className={styles.docSection}>
      <p className={styles.docSectionTitle}>{title}</p>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Required</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            {params.map((p) => (
              <tr key={p.name}>
                <td>
                  <code className={styles.paramName}>{p.name}</code>
                </td>
                <td className={styles.paramType}>{paramType(p.schema)}</td>
                <td>{p.required ? 'Yes' : 'No'}</td>
                <td className={styles.paramDesc}>{p.description ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

type CodeLang = 'curl' | 'js' | 'py';
const CODE_LANGS: Array<{ id: CodeLang; label: string }> = [
  { id: 'curl', label: 'cURL' },
  { id: 'js', label: 'JavaScript' },
  { id: 'py', label: 'Python' },
];

function OverviewTab({ path, method, op }: { path: string; method: Method; op: Operation }) {
  const pathParams = (op.parameters ?? []).filter((p) => p.in === 'path');
  const queryParams = (op.parameters ?? []).filter((p) => p.in === 'query');
  const bodySchema = op.requestBody?.content?.['application/json']?.schema;
  const bodyExample = jsonExample(op);
  const responses = Object.entries(op.responses ?? {});
  const primary = primaryResponse(op);
  const primarySchema = primary?.[1]?.content?.['application/json']?.schema;
  const responseExample = primarySchema
    ? JSON.stringify(primary![1].content!['application/json']!.example ?? exampleFromSchema(primarySchema), null, 2)
    : null;

  const [lang, setLang] = useState<CodeLang>('curl');
  const samples: Record<CodeLang, string> = {
    curl: curlSample(path, method, op),
    js: jsSample(path, method, op),
    py: pySample(path, method, op),
  };

  return (
    <div>
      <ParamTable title="Path parameters" params={pathParams} />
      <ParamTable title="Query parameters" params={queryParams} />

      {bodySchema?.properties && (
        <div className={styles.docSection}>
          <p className={styles.docSectionTitle}>Request body</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Field</th>
                  <th>Type</th>
                  <th>Required</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(bodySchema.properties).map(([name, sub]) => (
                  <tr key={name}>
                    <td>
                      <code className={styles.paramName}>{name}</code>
                    </td>
                    <td className={styles.paramType}>{paramType(sub)}</td>
                    <td>{bodySchema.required?.includes(name) ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {bodyExample && (
            <pre className={styles.pre}>
              <code>{bodyExample}</code>
            </pre>
          )}
        </div>
      )}

      {responses.length > 0 && (
        <div className={styles.docSection}>
          <p className={styles.docSectionTitle}>Responses</p>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {responses.map(([code, r]) => (
                  <tr key={code}>
                    <td>
                      <code className={styles.paramName}>{code}</code>
                    </td>
                    <td className={styles.paramDesc}>{r.description ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {responseExample && (
        <div className={styles.docSection}>
          <p className={styles.docSectionTitle}>Example response</p>
          <pre className={styles.pre}>
            <code>{responseExample}</code>
          </pre>
        </div>
      )}

      <div className={styles.docSection}>
        <p className={styles.docSectionTitle}>Code examples</p>
        <div className={styles.codeTabs}>
          {CODE_LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              className={`${styles.codeTab} ${lang === l.id ? styles.codeTabActive : ''}`}
              onClick={() => setLang(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
        <pre className={styles.pre}>
          <code>{samples[lang]}</code>
        </pre>
      </div>
    </div>
  );
}

function TryItOutTab({ path, method, op }: { path: string; method: Method; op: Operation }) {
  const pathParams = (op.parameters ?? []).filter((p) => p.in === 'path');
  const queryParams = (op.parameters ?? []).filter((p) => p.in === 'query');
  const hasBody = Boolean(op.requestBody);

  const [pathVals, setPathVals] = useState<Record<string, string>>({});
  const [queryVals, setQueryVals] = useState<Record<string, string>>({});
  const [body, setBody] = useState<string>(jsonExample(op));
  const [result, setResult] = useState<RunResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildUrl = (): string => {
    let p = path;
    for (const pp of pathParams) {
      p = p.replace(`{${pp.name}}`, encodeURIComponent(pathVals[pp.name] ?? ''));
    }
    const qs = new URLSearchParams();
    for (const qp of queryParams) {
      const v = queryVals[qp.name];
      if (v) qs.set(qp.name, v);
    }
    const q = qs.toString();
    return q ? `${p}?${q}` : p;
  };

  // The MCP endpoint (2026-07-28 spec) rejects a request that doesn't accept
  // both JSON and the SSE stream.
  const isMcp = path === '/api/mcp';

  const curl = useMemo(() => {
    const url = buildUrl();
    const parts = [`curl -X ${method.toUpperCase()} '${url}'`];
    if (isMcp) parts.push(`-H 'Accept: application/json, text/event-stream'`);
    if (hasBody && body.trim()) {
      parts.push(`-H 'Content-Type: application/json'`);
      parts.push(`-d '${body.replace(/\n\s*/g, ' ')}'`);
    }
    if (!isPublic(op)) parts.push(`--cookie 'your Clerk session'`);
    return parts.join(' \\\n  ');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, method, body, hasBody, pathVals, queryVals]);

  const run = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    // eslint-disable-next-line react-hooks/purity -- inside an async event handler, not render
    const started = Date.now();
    try {
      const headers: Record<string, string> = {};
      if (isMcp) headers['Accept'] = 'application/json, text/event-stream';
      const init: RequestInit = { method: method.toUpperCase(), credentials: 'include' };
      if (hasBody && body.trim()) {
        try {
          JSON.parse(body);
        } catch {
          setError('Request body is not valid JSON.');
          setRunning(false);
          return;
        }
        headers['Content-Type'] = 'application/json';
        init.body = body;
      }
      if (Object.keys(headers).length) init.headers = headers;
      const res = await fetch(buildUrl(), init);
      const text = await res.text();
      const rl = res.headers.get('RateLimit-Limit')
        ? `${res.headers.get('RateLimit-Remaining')}/${res.headers.get('RateLimit-Limit')} left`
        : undefined;
      setResult({
        status: res.status,
        statusText: res.statusText,
        // eslint-disable-next-line react-hooks/purity -- inside an async event handler, not render
        ms: Date.now() - started,
        body: fmt(text),
        rateLimit: rl,
        ok: res.ok,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Request failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <p className={styles.tryIntro}>
        This sends a real request to the current deployment using your signed-in session &mdash;
        no keys entered here.
      </p>

      {pathParams.length > 0 && (
        <div className={styles.fieldGroup}>
          <p className={styles.fieldGroupTitle}>Path parameters</p>
          {pathParams.map((pp) => (
            <label key={pp.name} className={styles.field}>
              <span className={styles.fieldLabel}>
                {pp.name}
                {pp.required && <em className={styles.req}> *</em>}
              </span>
              <input
                className={styles.input}
                value={pathVals[pp.name] ?? ''}
                placeholder={pp.description}
                onChange={(e) => setPathVals((v) => ({ ...v, [pp.name]: e.target.value }))}
              />
            </label>
          ))}
        </div>
      )}

      {queryParams.length > 0 && (
        <div className={styles.fieldGroup}>
          <p className={styles.fieldGroupTitle}>Query parameters</p>
          {queryParams.map((qp) => (
            <label key={qp.name} className={styles.field}>
              <span className={styles.fieldLabel}>
                {qp.name}
                {qp.required && <em className={styles.req}> *</em>}
                {qp.description && <span className={styles.fieldHint}> &mdash; {qp.description}</span>}
              </span>
              {qp.schema?.enum ? (
                <select
                  className={styles.input}
                  value={queryVals[qp.name] ?? ''}
                  onChange={(e) => setQueryVals((v) => ({ ...v, [qp.name]: e.target.value }))}
                >
                  <option value="">(none)</option>
                  {qp.schema.enum.map((o) => (
                    <option key={String(o)} value={String(o)}>
                      {String(o)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className={styles.input}
                  value={queryVals[qp.name] ?? ''}
                  placeholder={qp.example != null ? String(qp.example) : undefined}
                  onChange={(e) => setQueryVals((v) => ({ ...v, [qp.name]: e.target.value }))}
                />
              )}
            </label>
          ))}
        </div>
      )}

      {hasBody && (
        <div className={styles.fieldGroup}>
          <p className={styles.fieldGroupTitle}>
            Request body <span className={styles.fieldHint}>(JSON)</span>
          </p>
          <textarea
            className={styles.textarea}
            rows={Math.min(14, Math.max(4, body.split('\n').length + 1))}
            value={body}
            spellCheck={false}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>
      )}

      <div className={styles.panelActions}>
        <button type="button" className={styles.btnPrimary} onClick={run} disabled={running}>
          {running ? 'Sending…' : 'Send'}
        </button>
        <button
          type="button"
          className={styles.btnSecondary}
          onClick={() => navigator.clipboard?.writeText(curl)}
        >
          Copy as curl
        </button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {result && (
        <div className={styles.result}>
          <div className={styles.resultHead}>
            <span className={`${styles.status} ${result.ok ? styles.statusOk : styles.statusBad}`}>
              {result.status} {result.statusText}
            </span>
            <span className={styles.resultMeta}>{result.ms} ms</span>
            {result.rateLimit && <span className={styles.resultMeta}>{result.rateLimit}</span>}
          </div>
          <pre className={styles.pre}>
            <code>{result.body || '(empty response)'}</code>
          </pre>
        </div>
      )}
    </div>
  );
}

function EndpointPanel({ endpoint }: { endpoint: Endpoint }) {
  const { path, method, op } = endpoint;
  const [tab, setTab] = useState<'overview' | 'try'>('overview');

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <span className={`${styles.method} ${styles[`m_${method}`]}`}>{method.toUpperCase()}</span>
        <code className={styles.panelPath}>{path}</code>
        <span className={`${styles.authBadge} ${isPublic(op) ? styles.authPublic : ''}`}>
          {isPublic(op) ? 'public' : 'session'}
        </span>
      </div>
      {op.summary && <h2 className={styles.panelSummary}>{op.summary}</h2>}
      {op.description && <p className={styles.panelDesc}>{op.description}</p>}

      <div className={styles.tabBar} role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'overview'}
          className={`${styles.tab} ${tab === 'overview' ? styles.tabActive : ''}`}
          onClick={() => setTab('overview')}
        >
          Overview
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === 'try'}
          className={`${styles.tab} ${tab === 'try' ? styles.tabActive : ''}`}
          onClick={() => setTab('try')}
        >
          <svg className={styles.tabPlay} viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5l11 7-11 7V5z" fill="currentColor" />
          </svg>
          Try it out
        </button>
      </div>

      {tab === 'overview' ? (
        <OverviewTab path={path} method={method} op={op} />
      ) : (
        <TryItOutTab path={path} method={method} op={op} />
      )}
    </section>
  );
}

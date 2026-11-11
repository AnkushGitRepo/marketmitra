'use client';

import { useEffect, useMemo, useState } from 'react';
import { buildMcpClients, buildToolCallBody, type McpClientId } from '@/lib/api-docs/mcpClients';
import type { McpToolDoc } from '@/lib/api-docs/mcpTools';
import { evaluateChecks, type Check } from '@/lib/api-docs/checks';
import { ChecksPanel } from './ChecksPanel';
import { fmt } from './restDocs';
import styles from './page.module.css';

interface McpHubProps {
  url: string;
  tools: McpToolDoc[];
}

type Reach = 'checking' | 'live' | 'down';

export function McpHub({ url, tools }: McpHubProps) {
  const clients = buildMcpClients(url);
  const [clientId, setClientId] = useState<McpClientId>('cursor');
  const client = clients.find((c) => c.id === clientId) ?? clients[0];
  const [copied, setCopied] = useState<'config' | 'url' | null>(null);
  const [reach, setReach] = useState<Reach>('checking');
  const [toolName, setToolName] = useState(tools[0]?.name ?? '');
  const tool = tools.find((t) => t.name === toolName) ?? tools[0];

  // A real tools/list round trip, so "live" is measured, never hard-coded.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
      .then((res) => {
        if (!cancelled) setReach(res.ok ? 'live' : 'down');
      })
      .catch(() => {
        if (!cancelled) setReach('down');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const copy = async (what: 'config' | 'url') => {
    try {
      await navigator.clipboard.writeText(what === 'url' ? url : client.snippet);
      setCopied(what);
      setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className={styles.mcpHub}>
      <section className={styles.mcpConnect}>
        <h2 className={styles.mcpTitle}>MCP server</h2>
        <div className={styles.endpointRow}>
          <code className={styles.code}>{url}</code>
          <button type="button" className={styles.btnSecondary} onClick={() => copy('url')}>
            {copied === 'url' ? 'Copied' : 'Copy URL'}
          </button>
          <span className={styles.reach} data-state={reach}>
            {reach === 'checking' ? 'Checking…' : reach === 'live' ? 'Streamable HTTP · reachable' : 'Not reachable'}
          </span>
        </div>
        <p className={styles.mcpText}>
          {tools.length} tools, all read-only public market data. No key, fair-use rate limited. Add it to your AI client:
        </p>
        <div className={styles.codeTabs} role="tablist" aria-label="MCP client">
          {clients.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={c.id === clientId}
              className={`${styles.codeTab} ${c.id === clientId ? styles.codeTabActive : ''}`}
              onClick={() => setClientId(c.id)}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className={styles.fileHint}>
          {client.file === 'terminal' ? 'Run in your terminal' : `Add to ${client.file}`}
        </p>
        <pre className={styles.pre}>
          <code>{client.snippet}</code>
        </pre>
        <button type="button" className={styles.btnSecondary} onClick={() => copy('config')}>
          {copied === 'config' ? 'Copied' : 'Copy config'}
        </button>
      </section>

      <section className={styles.catalog} aria-label="MCP tools">
        <label className={styles.mobileSelect}>
          <span className={styles.srOnly}>Tool</span>
          <select className={styles.input} value={tool?.name ?? ''} onChange={(e) => setToolName(e.target.value)}>
            {tools.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <ul className={styles.toolNav}>
          {tools.map((t) => (
            <li key={t.name}>
              <button
                type="button"
                className={`${styles.toolNavRow} ${t.name === tool?.name ? styles.toolNavActive : ''}`}
                aria-current={t.name === tool?.name}
                onClick={() => setToolName(t.name)}
              >
                <code className={styles.toolNavName}>{t.name}</code>
                <span className={styles.toolNavSummary}>{t.summary}</span>
              </button>
            </li>
          ))}
        </ul>
        {tool && <ToolInspector key={tool.name} tool={tool} />}
      </section>
    </div>
  );
}

function ToolInspector({ tool }: { tool: McpToolDoc }) {
  const body = buildToolCallBody(tool.name, tool.exampleArgs);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<{
    ok: boolean;
    text: string;
    raw: string;
    status: number;
    headers: Record<string, string>;
    ms: number;
  } | null>(null);
  const [checks, setChecks] = useState<Check[]>([
    { kind: 'status', equals: 200 },
    { kind: 'jsonPath', path: 'result.content', mode: 'exists' },
  ]);
  const report = useMemo(
    () => (output ? evaluateChecks(checks, { status: output.status, headers: output.headers, body: output.raw }) : null),
    [output, checks]
  );

  const run = async () => {
    setRunning(true);
    setOutput(null);
    // eslint-disable-next-line react-hooks/purity -- inside an async event handler, not render
    const started = Date.now();
    try {
      const res = await fetch('/api/mcp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
        body,
      });
      const text = await res.text();
      setOutput({
        ok: res.ok,
        text: fmt(text),
        raw: text,
        status: res.status,
        headers: Object.fromEntries([...res.headers.entries()].map(([k, v]) => [k.toLowerCase(), v])),
        // eslint-disable-next-line react-hooks/purity -- inside an async event handler, not render
        ms: Date.now() - started,
      });
    } catch (e) {
      setOutput({
        ok: false,
        text: e instanceof Error ? e.message : 'Request failed',
        raw: '',
        status: 0,
        headers: {},
        // eslint-disable-next-line react-hooks/purity -- inside an async event handler, not render
        ms: Date.now() - started,
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <article className={styles.inspector}>
      <header className={styles.toolHead}>
        <code className={styles.toolName}>{tool.name}</code>
        <span className={styles.toolTitle}>{tool.title}</span>
      </header>
      <div className={styles.badges}>
        <span className={styles.badge}>Read-only</span>
        <span className={styles.badge}>Public</span>
        <span className={styles.badge}>Rate-limited</span>
      </div>
      <p className={styles.toolBlurb}>{tool.description}</p>

      {tool.params.length > 0 ? (
        <div className={`${styles.tableWrap} ${styles.paramScroll}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Type</th>
                <th>Required</th>
                <th>Default</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {tool.params.map((p) => (
                <tr key={p.name}>
                  <td>
                    <code className={styles.paramName}>{p.name}</code>
                  </td>
                  <td className={styles.paramType}>{p.type}</td>
                  <td>{p.required ? 'Yes' : 'No'}</td>
                  <td className={styles.paramType}>{p.default === undefined ? '—' : JSON.stringify(p.default)}</td>
                  <td className={styles.paramDesc}>{p.description || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className={styles.noParams}>No parameters.</p>
      )}

      <p className={styles.docSectionTitle}>Example request</p>
      <pre className={styles.pre}>
        <code>{JSON.stringify(JSON.parse(body), null, 2)}</code>
      </pre>
      <ChecksPanel checks={checks} onChange={setChecks} report={report} />
      <button type="button" className={styles.btnPrimary} onClick={run} disabled={running}>
        {running ? 'Running…' : 'Run example'}
      </button>
      {output && (
        <div className={styles.result}>
          <div className={styles.resultHead}>
            <span className={`${styles.status} ${output.ok ? styles.statusOk : styles.statusBad}`}>
              {output.ok ? 'OK' : 'Error'}
            </span>
            <span className={styles.resultMeta}>{output.ms} ms &middot; live response</span>
          </div>
          <details open>
            <summary className={styles.fileHint}>Response (live)</summary>
            <pre className={`${styles.pre} ${styles.outputPre}`}>
              <code>{output.text}</code>
            </pre>
          </details>
        </div>
      )}
    </article>
  );
}

'use client';

import { useMemo, useState } from 'react';
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

export function McpHub({ url, tools }: McpHubProps) {
  const clients = buildMcpClients(url);
  const [clientId, setClientId] = useState<McpClientId>('cursor');
  const client = clients.find((c) => c.id === clientId) ?? clients[0];
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(client.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={styles.mcpHub}>
      <section className={styles.mcpConnect}>
        <h2 className={styles.mcpTitle}>Connect an MCP client</h2>
        <p className={styles.mcpText}>
          Streamable HTTP at <code className={styles.code}>{url}</code>. All {tools.length} tools
          are read-only public market data &mdash; no key, fair-use rate limited.
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
        <button type="button" className={styles.btnSecondary} onClick={copy}>
          {copied ? 'Copied' : 'Copy config'}
        </button>
      </section>

      <section aria-label="MCP tools" className={styles.toolCards}>
        {tools.map((t) => (
          <ToolCard key={t.name} tool={t} />
        ))}
      </section>
    </div>
  );
}

function ToolCard({ tool }: { tool: McpToolDoc }) {
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
    <article className={styles.toolCard}>
      <header className={styles.toolHead}>
        <code className={styles.toolName}>{tool.name}</code>
        <span className={styles.toolTitle}>{tool.title}</span>
      </header>
      <p className={styles.toolBlurb}>{tool.description}</p>

      {tool.params.length > 0 ? (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Type</th>
                <th>Required</th>
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
          <pre className={`${styles.pre} ${styles.outputPre}`}>
            <code>{output.text}</code>
          </pre>
        </div>
      )}
    </article>
  );
}

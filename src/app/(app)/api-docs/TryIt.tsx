'use client';

import { useMemo, useState } from 'react';
import { defaultChecks, evaluateChecks, type Check } from '@/lib/api-docs/checks';
import { ChecksPanel } from './ChecksPanel';
import { fmt, isPublic, jsonExample, type Method, type Operation, type RunResult } from './restDocs';
import styles from './page.module.css';

export function TryIt({ path, method, op }: { path: string; method: Method; op: Operation }) {
  const pathParams = (op.parameters ?? []).filter((p) => p.in === 'path');
  const queryParams = (op.parameters ?? []).filter((p) => p.in === 'query');
  const hasBody = Boolean(op.requestBody);

  const [pathVals, setPathVals] = useState<Record<string, string>>({});
  const [queryVals, setQueryVals] = useState<Record<string, string>>({});
  const [body, setBody] = useState<string>(jsonExample(op));
  const [result, setResult] = useState<RunResult | null>(null);
  const [checks, setChecks] = useState<Check[]>(() => defaultChecks(Object.keys(op.responses ?? {})));
  const report = useMemo(
    () => (result ? evaluateChecks(checks, { status: result.status, headers: result.headers, body: result.raw }) : null),
    [result, checks]
  );
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
        raw: text,
        headers: Object.fromEntries([...res.headers.entries()].map(([k, v]) => [k.toLowerCase(), v])),
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

      <ChecksPanel checks={checks} onChange={setChecks} report={report} />

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

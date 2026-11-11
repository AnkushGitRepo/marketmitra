'use client';

import { useMemo, useState } from 'react';
import { groupEndpoints, type ApiCategory } from '@/lib/api-docs/categories';
import {
  curlSample,
  exampleFromSchema,
  isPublic,
  jsSample,
  primaryResponse,
  pySample,
  paramType,
  type Endpoint,
} from './restDocs';
import { ParamTable } from './ParamTable';
import { TryIt } from './TryIt';
import styles from './page.module.css';

type CodeLang = 'curl' | 'js' | 'py';
const CODE_LANGS: Array<{ id: CodeLang; label: string }> = [
  { id: 'curl', label: 'cURL' },
  { id: 'js', label: 'TypeScript' },
  { id: 'py', label: 'Python' },
];

interface RestReferenceProps {
  endpoints: Endpoint[];
}

export function RestReference({ endpoints }: RestReferenceProps) {
  const groups = useMemo(
    () => groupEndpoints(endpoints.map((e) => ({ ...e, tag: e.op.tags?.[0] }))),
    [endpoints]
  );
  const [selectedId, setSelectedId] = useState(endpoints[0]?.id ?? '');
  const selected = endpoints.find((e) => e.id === selectedId) ?? endpoints[0];
  const selectedCategory = groups.find((g) => g.items.some((e) => e.id === selected?.id))?.category;
  // Only the category holding the active endpoint is open unless the reader opens another.
  const [opened, setOpened] = useState<Partial<Record<ApiCategory, boolean>>>({});
  const isOpen = (c: ApiCategory) => opened[c] ?? c === selectedCategory;

  return (
    <div className={styles.restGrid}>
      <label className={styles.mobileSelect}>
        <span className={styles.srOnly}>Endpoint</span>
        <select
          className={styles.input}
          value={selected?.id ?? ''}
          onChange={(e) => setSelectedId(e.target.value)}
        >
          {groups.map((g) => (
            <optgroup key={g.category} label={g.category}>
              {g.items.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.method.toUpperCase()} {ep.path.replace('/api', '')}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <nav className={styles.restNav} aria-label="Endpoints by category">
        {groups.map((g) => {
          const open = isOpen(g.category);
          return (
            <div key={g.category} className={styles.navGroup}>
              <button
                type="button"
                className={styles.navGroupHead}
                aria-expanded={open}
                onClick={() => setOpened((o) => ({ ...o, [g.category]: !open }))}
              >
                <span className={styles.navGroupTitle}>{g.category}</span>
                <span className={styles.navCount}>{g.items.length}</span>
              </button>
              {open &&
                g.items.map((ep) => (
                  <button
                    key={ep.id}
                    type="button"
                    className={`${styles.navRow} ${ep.id === selected?.id ? styles.navRowActive : ''}`}
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

      {selected && <EndpointDocs key={selected.id} endpoint={selected} />}
    </div>
  );
}

function EndpointDocs({ endpoint }: { endpoint: Endpoint }) {
  const { path, method, op } = endpoint;
  const pathParams = (op.parameters ?? []).filter((p) => p.in === 'path');
  const queryParams = (op.parameters ?? []).filter((p) => p.in === 'query');
  const bodySchema = op.requestBody?.content?.['application/json']?.schema;
  const responses = Object.entries(op.responses ?? {});
  const primary = primaryResponse(op);
  const primaryJson = primary?.[1]?.content?.['application/json'];
  const responseExample = primaryJson?.schema
    ? JSON.stringify(primaryJson.example ?? exampleFromSchema(primaryJson.schema), null, 2)
    : null;
  const [lang, setLang] = useState<CodeLang>('curl');
  const samples: Record<CodeLang, string> = {
    curl: curlSample(path, method, op),
    js: jsSample(path, method, op),
    py: pySample(path, method, op),
  };

  return (
    <>
      <section className={styles.restDocs}>
        <div className={styles.panelHead}>
          <span className={`${styles.method} ${styles[`m_${method}`]}`}>{method.toUpperCase()}</span>
          <code className={styles.panelPath}>{path}</code>
          <span className={`${styles.authBadge} ${isPublic(op) ? styles.authPublic : ''}`}>
            {isPublic(op) ? 'public' : 'session'}
          </span>
        </div>
        {op.summary && <h2 className={styles.panelSummary}>{op.summary}</h2>}
        {op.description && <p className={styles.panelDesc}>{op.description}</p>}

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
          </div>
        )}

        {responses.length > 0 && (
          <div className={styles.docSection}>
            <p className={styles.docSectionTitle}>Responses</p>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
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
            <p className={styles.docSectionTitle}>Response shape</p>
            <pre className={styles.pre}>
              <code>{responseExample}</code>
            </pre>
          </div>
        )}
      </section>

      <aside className={styles.restCode} aria-label="Code samples and Try it">
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
        <div className={styles.tryDesktopOnly}>
          <p className={styles.docSectionTitle}>Try it</p>
          <TryIt path={path} method={method} op={op} />
        </div>
      </aside>
    </>
  );
}


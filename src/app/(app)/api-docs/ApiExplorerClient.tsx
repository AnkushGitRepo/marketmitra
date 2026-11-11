'use client';

import { useEffect, useMemo, useState } from 'react';
import { mcpUrl } from '@/lib/api-docs/mcpClients';
import type { McpToolDoc } from '@/lib/api-docs/mcpTools';
import { buildAgentPrompt } from './agentPrompt';
import { AuthSection } from './AuthSection';
import { McpHub } from './McpHub';
import { RestReference } from './RestReference';
import { listEndpoints, type OpenApiSpec } from './restDocs';
import { SchemasTab } from './SchemasTab';
import styles from './page.module.css';

export type { OpenApiSpec } from './restDocs';

type TabId = 'mcp' | 'rest' | 'schemas';
const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'mcp', label: 'AI Agents & MCP' },
  { id: 'rest', label: 'REST API Reference' },
  { id: 'schemas', label: 'Schemas & OpenAPI' },
];

interface ApiExplorerClientProps {
  spec: OpenApiSpec;
  tools: McpToolDoc[];
}

export function ApiExplorerClient({ spec, tools }: ApiExplorerClientProps) {
  const endpoints = useMemo(() => listEndpoints(spec), [spec]);
  const [tab, setTab] = useState<TabId>('mcp');
  // Relative on the server so SSR and the first client render match; absolute after mount.
  const [origin, setOrigin] = useState('');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- deliberate: origin is only known on the client
    setOrigin(window.location.origin);
  }, []);
  const [copied, setCopied] = useState(false);

  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(buildAgentPrompt(spec, tools, endpoints, origin));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={styles.explorer}>
      <div className={styles.headRow}>
        <div>
          <p className={styles.eyebrow}>Developers</p>
          <h1 className={styles.h1}>API &amp; MCP reference</h1>
          <p className={styles.metaLine}>
            v{spec.info.version} &middot; {endpoints.length} REST endpoints &middot; {tools.length} MCP tools
          </p>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={copyPrompt}>
          {copied ? 'Copied' : 'Copy API context prompt'}
        </button>
      </div>

      <div className={styles.topTabs} role="tablist" aria-label="Reference sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`${styles.topTab} ${tab === t.id ? styles.topTabActive : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'mcp' && <McpHub url={mcpUrl(origin)} tools={tools} />}
      {tab === 'rest' && (
        <>
          <AuthSection />
          <RestReference endpoints={endpoints} />
        </>
      )}
      {tab === 'schemas' && <SchemasTab spec={spec} endpointCount={endpoints.length} />}
    </div>
  );
}

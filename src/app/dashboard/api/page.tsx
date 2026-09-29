import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tools } from '@/lib/mcp/tools';
import { MCP_SERVER_INFO } from '@/lib/mcp/server';
import { ApiExplorerClient, type OpenApiSpec } from './ApiExplorerClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

async function loadSpec(): Promise<OpenApiSpec> {
  const raw = await readFile(join(process.cwd(), 'public', 'openapi.json'), 'utf8');
  return JSON.parse(raw) as OpenApiSpec;
}

export default async function ApiExplorerPage() {
  const spec = await loadSpec();

  const mcp = {
    serverInfo: MCP_SERVER_INFO,
    tools: tools.map((t) => ({ name: t.name, description: t.config.description })),
  };

  return (
    <div className={styles.pageRoot}>
      <p className={styles.eyebrow}>Developers</p>
      <h1 className={styles.h1}>API reference</h1>
      <p className={styles.introNote}>
        Browse and try MarketMitra&rsquo;s HTTP API against this deployment, using your current
        session. Public endpoints work for anyone; the rest use your signed-in session &mdash; no
        keys are entered here. For automated / agent access to public market data, prefer the{' '}
        <strong>MCP server</strong> below. Full reference:{' '}
        <a href="https://github.com/AnkushGitRepo/marketmitra/blob/main/docs/api-surface.md">
          docs/api-surface.md
        </a>
        . The machine-readable spec is at <a href="/openapi.json">/openapi.json</a>.
      </p>
      <ApiExplorerClient spec={spec} mcp={mcp} />
    </div>
  );
}

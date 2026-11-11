import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describeTools } from '@/lib/api-docs/mcpTools';
import { tools } from '@/lib/mcp/tools';
import { ApiExplorerClient, type OpenApiSpec } from './ApiExplorerClient';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

async function loadSpec(): Promise<OpenApiSpec> {
  const raw = await readFile(join(process.cwd(), 'public', 'openapi.json'), 'utf8');
  return JSON.parse(raw) as OpenApiSpec;
}

export default async function ApiExplorerPage() {
  const spec = await loadSpec();
  return (
    <div className={styles.pageRoot}>
      <ApiExplorerClient spec={spec} tools={describeTools(tools)} />
    </div>
  );
}

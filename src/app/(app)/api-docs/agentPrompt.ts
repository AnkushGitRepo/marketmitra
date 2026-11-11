import { DOC_HOST, isPublic, paramType, type Endpoint, type OpenApiSpec } from './restDocs';
import type { McpToolDoc } from '@/lib/api-docs/mcpTools';

export function buildAgentPrompt(spec: OpenApiSpec, tools: McpToolDoc[], endpoints: Endpoint[], origin: string): string {
  const lines: string[] = [];
  lines.push(`You are working against the ${spec.info.title} (v${spec.info.version}).`);
  lines.push(`Base URL: ${origin || DOC_HOST}`);
  if (spec.info.description) lines.push(spec.info.description);
  lines.push('');
  lines.push(
    `Prefer the MCP server for read-only public market data: ${origin || DOC_HOST}/api/mcp (streamable HTTP, no auth). Tools:`
  );
  for (const t of tools) lines.push(`  - ${t.name}: ${t.description}`);
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

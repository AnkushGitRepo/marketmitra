// One-click config snippets for MCP clients, built from this deployment's URL.

export const MCP_SERVER_NAME = 'marketmitra';
const MCP_PATH = '/api/mcp';

export type McpClientId = 'cursor' | 'claude-code' | 'claude-desktop' | 'windsurf';

export interface McpClientConfig {
  id: McpClientId;
  label: string;
  /** Where the snippet goes (a file path or "terminal"). */
  file: string;
  snippet: string;
}

export function mcpUrl(origin: string): string {
  return `${origin.replace(/\/+$/, '')}${MCP_PATH}`;
}

export function buildMcpClients(url: string): McpClientConfig[] {
  return [
    {
      id: 'cursor',
      label: 'Cursor',
      file: '.cursor/mcp.json',
      snippet: JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { url } } }, null, 2),
    },
    {
      id: 'claude-code',
      label: 'Claude Code',
      file: 'terminal',
      snippet: `claude mcp add --transport http ${MCP_SERVER_NAME} ${url}`,
    },
    {
      id: 'claude-desktop',
      label: 'Claude Desktop',
      file: 'claude_desktop_config.json',
      snippet: JSON.stringify(
        { mcpServers: { [MCP_SERVER_NAME]: { command: 'npx', args: ['-y', 'mcp-remote', url] } } },
        null,
        2
      ),
    },
    {
      id: 'windsurf',
      label: 'Windsurf',
      file: '~/.codeium/windsurf/mcp_config.json',
      snippet: JSON.stringify({ mcpServers: { [MCP_SERVER_NAME]: { serverUrl: url } } }, null, 2),
    },
  ];
}

export function buildToolCallBody(name: string, args: Record<string, unknown>): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name, arguments: args },
  });
}

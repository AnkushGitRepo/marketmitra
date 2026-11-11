import { describe, expect, it } from 'vitest';
import { buildMcpClients, buildToolCallBody, mcpUrl } from './mcpClients';

const URL_ = 'https://mm.example/api/mcp';

describe('mcpUrl', () => {
  it('joins origin and path without doubling slashes', () => {
    expect(mcpUrl('https://mm.example/')).toBe(URL_);
    expect(mcpUrl('https://mm.example')).toBe(URL_);
  });
  it('stays relative when there is no origin yet (SSR)', () => {
    expect(mcpUrl('')).toBe('/api/mcp');
  });
});

describe('buildMcpClients', () => {
  const [cursor, claudeCode, desktop, windsurf] = buildMcpClients(URL_);

  it('lists Cursor, Claude Code, Claude Desktop and Windsurf in that order', () => {
    expect([cursor.id, claudeCode.id, desktop.id, windsurf.id]).toEqual([
      'cursor',
      'claude-code',
      'claude-desktop',
      'windsurf',
    ]);
  });

  it('Windsurf uses serverUrl in its own config file', () => {
    expect(JSON.parse(windsurf.snippet)).toEqual({ mcpServers: { marketmitra: { serverUrl: URL_ } } });
    expect(windsurf.file).toBe('~/.codeium/windsurf/mcp_config.json');
  });

  it('Cursor uses the mcpServers shape with the deployment url', () => {
    expect(JSON.parse(cursor.snippet)).toEqual({ mcpServers: { marketmitra: { url: URL_ } } });
    expect(cursor.file).toBe('.cursor/mcp.json');
  });

  it('Claude Code is a one-line CLI command over http transport', () => {
    expect(claudeCode.snippet).toBe(`claude mcp add --transport http marketmitra ${URL_}`);
  });

  it('Claude Desktop bridges through mcp-remote', () => {
    expect(JSON.parse(desktop.snippet)).toEqual({
      mcpServers: { marketmitra: { command: 'npx', args: ['-y', 'mcp-remote', URL_] } },
    });
  });
});

describe('buildToolCallBody', () => {
  it('builds a JSON-RPC tools/call request', () => {
    expect(JSON.parse(buildToolCallBody('get_quote', { symbols: ['TCS'] }))).toEqual({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: 'get_quote', arguments: { symbols: ['TCS'] } },
    });
  });
});

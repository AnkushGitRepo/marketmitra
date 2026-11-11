import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_RESPONSE_CHARS, buildCatalog, describeCatalog, resolveRequest, truncateBody } from './platformApi';

const spec = JSON.parse(readFileSync(join(process.cwd(), 'public', 'openapi.json'), 'utf8'));
const catalog = buildCatalog(spec);
const has = (t: string) => catalog.some((e) => e.template === t);

describe('buildCatalog (real openapi.json)', () => {
  it('exposes the data endpoints the chat should read', () => {
    for (const t of ['/api/holdings', '/api/stock/{ticker}', '/api/news', '/api/screener', '/api/alerts', '/api/notes', '/api/watchlists', '/api/search', '/api/status']) {
      expect(has(t), t).toBe(true);
    }
  });

  it('never exposes settings, cron, advisor, the chat itself, logs or exports', () => {
    for (const e of catalog) {
      expect(e.template, e.template).not.toMatch(/^\/api\/(settings|cron|advisor|mitra\/|mcp|ai)/);
    }
    expect(has('/api/system/logs')).toBe(false);
    expect(has('/api/screener/export')).toBe(false);
  });

  it('only ever lists GET operations (writes are not in the catalog)', () => {
    const getPaths = Object.entries(spec.paths as Record<string, Record<string, unknown>>)
      .filter(([, ops]) => ops.get)
      .map(([p]) => p);
    for (const e of catalog) expect(getPaths).toContain(e.template);
  });

  it('describes every endpoint compactly', () => {
    const text = describeCatalog(catalog);
    expect(text.split('\n')).toHaveLength(catalog.length);
    expect(text).toContain('GET /api/stock/{ticker}');
  });
});

describe('resolveRequest', () => {
  it('accepts a concrete path and a declared query', () => {
    expect(resolveRequest(catalog, '/api/stock/TCS', undefined)).toEqual({ ok: true, pathAndQuery: '/api/stock/TCS' });
    expect(resolveRequest(catalog, '/api/screener', 'pe_max=25&sector=Information%20Technology')).toEqual({
      ok: true,
      pathAndQuery: '/api/screener?pe_max=25&sector=Information+Technology',
    });
  });

  it('rejects undocumented, denied and non-/api paths', () => {
    for (const p of ['/api/settings/ai', '/api/cron/evaluate-alerts', '/api/advisor/policy', '/api/mitra/conversations', '/api/nope', '/dashboard', 'https://evil.example/api/holdings', '//evil.example/api/holdings']) {
      expect(resolveRequest(catalog, p, undefined).ok, p).toBe(false);
    }
  });

  it('rejects traversal, embedded queries, odd segments and extra depth', () => {
    for (const p of ['/api/stock/../settings/ai', '/api/stock/TCS?x=1', '/api/stock/TCS#a', '/api/stock/T%2FCS', '/api/stock/TCS/extra', '/api/stock/' + 'A'.repeat(61)]) {
      expect(resolveRequest(catalog, p, undefined).ok, p).toBe(false);
    }
  });

  it('rejects unknown or oversized query parameters', () => {
    expect(resolveRequest(catalog, '/api/news', 'evil=1').ok).toBe(false);
    expect(resolveRequest(catalog, '/api/news', `symbols=${'x'.repeat(201)}`).ok).toBe(false);
    expect(resolveRequest(catalog, '/api/holdings', 'x=1').ok).toBe(false);
  });
});

describe('truncateBody', () => {
  it('passes small bodies through and caps large ones', () => {
    expect(truncateBody('{"a":1}')).toEqual({ text: '{"a":1}', truncated: false });
    const big = truncateBody('x'.repeat(MAX_RESPONSE_CHARS + 5));
    expect(big.truncated).toBe(true);
    expect(big.text).toHaveLength(MAX_RESPONSE_CHARS);
  });
});

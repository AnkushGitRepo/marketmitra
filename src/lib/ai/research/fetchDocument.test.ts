import { describe, expect, it, vi } from 'vitest';
import { fetchDocument, type Fetcher } from './fetchDocument';

const html = (body: string, status = 200, headers: Record<string, string> = {}) =>
  new Response(`<html><head><title>T</title></head><body><p>${body}</p></body></html>`, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });

const fetcherOf = (responses: Record<string, Response>): Fetcher & { calls: string[] } => {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const r = responses[url];
    if (!r) throw new Error(`unexpected ${url}`);
    return r;
  };
  return Object.assign(fn as unknown as Fetcher, { calls });
};

describe('fetchDocument', () => {
  it('reads an html page', async () => {
    const out = await fetchDocument('https://a.com/x', 1000, fetcherOf({ 'https://a.com/x': html('Order passed') }));
    expect(out).toMatchObject({ ok: true, document: { title: 'T', text: 'Order passed', kind: 'html', url: 'https://a.com/x' } });
  });

  it('follows redirects by hand and gives each hop to the fetcher to validate', async () => {
    const f = fetcherOf({
      'https://a.com/old': new Response(null, { status: 301, headers: { location: '/new' } }),
      'https://a.com/new': html('Moved'),
    });
    const out = await fetchDocument('https://a.com/old', 1000, f);
    expect(f.calls).toEqual(['https://a.com/old', 'https://a.com/new']);
    expect(out).toMatchObject({ ok: true, document: { url: 'https://a.com/new' } });
  });

  it('stops after too many redirects and on a redirect with no destination', async () => {
    const loop = fetcherOf({ 'https://a.com/1': new Response(null, { status: 302, headers: { location: 'https://a.com/1' } }) });
    const loopFetch = (async (url: string) => new Response(null, { status: 302, headers: { location: url } })) as unknown as Fetcher;
    expect(await fetchDocument('https://a.com/1', 1000, loopFetch)).toEqual({ ok: false, reason: 'Too many redirects' });
    expect(await fetchDocument('https://a.com/1', 1000, fetcherOf({ 'https://a.com/1': new Response(null, { status: 302 }) }))).toEqual({ ok: false, reason: 'Redirect without a destination' });
    expect(loop.calls).toEqual([]);
  });

  it('reports an error status, a non-page type and a blocked address plainly', async () => {
    expect(await fetchDocument('https://a.com/x', 1000, fetcherOf({ 'https://a.com/x': new Response('no', { status: 404 }) }))).toEqual({ ok: false, reason: 'The site answered HTTP 404' });
    expect(await fetchDocument('https://a.com/x', 1000, fetcherOf({ 'https://a.com/x': new Response('{}', { headers: { 'content-type': 'application/json' } }) }))).toMatchObject({ ok: false });
    const blocked = vi.fn(async () => {
      throw Object.assign(new Error('x'), { name: 'OutboundBlockedError' });
    }) as unknown as Fetcher;
    expect((await fetchDocument('http://localhost/x', 1000, blocked)).ok).toBe(false);
  });

  it('refuses a document over the size cap without reading it all', async () => {
    const big = new Response(new Uint8Array(6_500_000), { headers: { 'content-type': 'text/html' } });
    expect(await fetchDocument('https://a.com/big', 1000, fetcherOf({ 'https://a.com/big': big }))).toEqual({ ok: false, reason: 'The document is too large to read' });
  });

  it('says so when a page has no readable text', async () => {
    const out = await fetchDocument('https://a.com/js', 1000, fetcherOf({ 'https://a.com/js': new Response('<html><body><script>x()</script></body></html>', { headers: { 'content-type': 'text/html' } }) }));
    expect(out).toMatchObject({ ok: false });
  });

  it('says so when a PDF cannot be read', async () => {
    const out = await fetchDocument('https://a.com/a.pdf', 1000, fetcherOf({ 'https://a.com/a.pdf': new Response('not really a pdf', { headers: { 'content-type': 'application/pdf' } }) }));
    expect(out).toEqual({ ok: false, reason: 'No text could be read from the PDF (it may be a scan)' });
  });
});

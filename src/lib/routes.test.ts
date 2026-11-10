import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { APP_PAGE_SEGMENTS, API_DOCS_PATH, legacyDashboardRedirects } from './routes';

const APP_DIR = join(process.cwd(), 'src', 'app', '(app)');

/** Folders under (app)/ that serve a URL, i.e. everything except the home page folder. */
const pageFolders = readdirSync(APP_DIR, { withFileTypes: true })
  .filter((e) => e.isDirectory() && e.name !== 'dashboard')
  .map((e) => e.name);

describe('app route registry', () => {
  it('registers every page folder under (app)/ for auth protection and redirects', () => {
    const known = new Set<string>([...APP_PAGE_SEGMENTS, API_DOCS_PATH.slice(1)]);
    for (const folder of pageFolders) expect(known, `unregistered page folder: ${folder}`).toContain(folder);
  });

  it('has a folder for every registered segment', () => {
    for (const segment of APP_PAGE_SEGMENTS) expect(pageFolders, segment).toContain(segment);
  });

  it('keeps /dashboard as the home and /api untouched', () => {
    expect(APP_PAGE_SEGMENTS).not.toContain('dashboard');
    expect(APP_PAGE_SEGMENTS).not.toContain('api');
  });
});

describe('legacyDashboardRedirects', () => {
  const table = legacyDashboardRedirects();

  it('redirects every old /dashboard/<page> permanently to /<page>', () => {
    expect(table).toContainEqual({ source: '/dashboard/portfolio/:path*', destination: '/portfolio/:path*', permanent: true });
    expect(table).toContainEqual({ source: '/dashboard/stock/:path*', destination: '/stock/:path*', permanent: true });
    expect(table.every((r) => r.permanent)).toBe(true);
  });

  it('sends the API reference to /api-docs, not /api', () => {
    expect(table).toContainEqual({ source: '/dashboard/api/:path*', destination: '/api-docs/:path*', permanent: true });
    expect(table.some((r) => r.destination.startsWith('/api/'))).toBe(false);
  });

  it('never redirects the home page itself', () => {
    expect(table.some((r) => r.source === '/dashboard' || r.source === '/dashboard/:path*')).toBe(false);
  });
});

describe('proxy auth matcher', () => {
  const proxySource = readFileSync(join(process.cwd(), 'src', 'proxy.ts'), 'utf8');

  it('protects /dashboard, every app page and /api-docs (the matcher must stay a static literal)', () => {
    for (const segment of [...APP_PAGE_SEGMENTS, 'api-docs']) {
      expect(proxySource, `proxy matcher missing /${segment}`).toContain(`'/${segment}/:path*'`);
      expect(proxySource, `route matcher missing /${segment}`).toContain(`'/${segment}(.*)'`);
    }
    expect(proxySource).toContain("'/dashboard/:path*'");
  });
});

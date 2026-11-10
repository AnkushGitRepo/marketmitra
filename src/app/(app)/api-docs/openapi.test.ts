import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const API_DIR = join(ROOT, 'src', 'app', 'api');

const spec = JSON.parse(readFileSync(join(ROOT, 'public', 'openapi.json'), 'utf8')) as {
  paths: Record<string, Record<string, unknown>>;
};

/** `/api/holdings/{id}` -> `src/app/api/holdings/[id]/route.ts` */
function routeFileFor(apiPath: string): string {
  const rel = apiPath
    .replace(/^\/api\//, '')
    .replace(/\{([^}]+)\}/g, '[$1]');
  return join(API_DIR, rel, 'route.ts');
}

/** Every `route.ts` under src/app/api, as `/api/...` paths (dynamic segs -> {id}). */
function discoverRouteApiPaths(): string[] {
  const out: string[] = [];
  const walk = (dir: string, segments: string[]) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        walk(join(dir, entry.name), [...segments, entry.name]);
      } else if (entry.name === 'route.ts') {
        const path =
          '/api/' + segments.map((s) => s.replace(/^\[(.+)\]$/, '{$1}')).join('/');
        out.push(path.replace(/\/$/, '') || '/api');
      }
    }
  };
  walk(API_DIR, []);
  return out;
}

const documentedPaths = Object.keys(spec.paths);
const discoveredPaths = discoverRouteApiPaths();

describe('openapi.json ↔ route handlers', () => {
  it('every documented path has a matching route.ts', () => {
    for (const p of documentedPaths) {
      expect(() => readFileSync(routeFileFor(p), 'utf8'), `missing route for ${p}`).not.toThrow();
    }
  });

  it('every documented method is exported by its route.ts', () => {
    for (const [p, ops] of Object.entries(spec.paths)) {
      const src = readFileSync(routeFileFor(p), 'utf8');
      for (const method of Object.keys(ops)) {
        const M = method.toUpperCase();
        const exported =
          new RegExp(`export\\s+(async\\s+)?function\\s+${M}\\b`).test(src) ||
          new RegExp(`export\\s+const\\s+${M}\\b`).test(src) ||
          new RegExp(`\\bas\\s+${M}\\b`).test(src); // export { handler as GET, ... }
        expect(exported, `${M} ${p} not exported by its route.ts`).toBe(true);
      }
    }
  });

  it('every route.ts is documented in openapi.json', () => {
    const undocumented = discoveredPaths.filter((p) => !documentedPaths.includes(p));
    expect(undocumented, `undocumented routes: ${undocumented.join(', ')}`).toEqual([]);
  });
});

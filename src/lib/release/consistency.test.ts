import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { latestChangelogVersion, parseVersion } from './release';
import { APP_VERSION } from '../version';

// The version lives in package.json. These tests fail CI the moment another place disagrees, so a half-done release cannot merge.

const read = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8');
const pkgVersion = (JSON.parse(read('package.json')) as { version: string }).version;

describe('one product version', () => {
  it('package.json holds a plain MAJOR.MINOR.PATCH version', () => {
    expect(() => parseVersion(pkgVersion)).not.toThrow();
  });

  it('the running app reports the package.json version', () => {
    expect(APP_VERSION).toBe(pkgVersion);
  });

  it('package-lock.json agrees', () => {
    const lock = JSON.parse(read('package-lock.json')) as { version: string; packages: Record<string, { version?: string }> };
    expect(lock.version).toBe(pkgVersion);
    expect(lock.packages[''].version).toBe(pkgVersion);
  });

  it('the API reference (openapi.json info.version) agrees', () => {
    const spec = JSON.parse(read('public/openapi.json')) as { info: { version: string } };
    expect(spec.info.version).toBe(pkgVersion);
  });

  it('the newest CHANGELOG.md entry is this version (once a changelog exists)', () => {
    let changelog: string | null = null;
    try {
      changelog = read('CHANGELOG.md');
    } catch {
      changelog = null;
    }
    if (changelog === null) return; // the first release creates it
    expect(latestChangelogVersion(changelog)).toBe(pkgVersion);
  });
});

// The running version. `package.json` is the single source of truth; the commit id is stamped in at build time.

import pkg from '../../package.json';

/** The product version (SemVer). App and API ship together, so this is also the API reference version. */
export const APP_VERSION: string = pkg.version;

/** Short commit id the build was made from, or "dev" for a local run without one. */
export const APP_COMMIT: string = process.env.NEXT_PUBLIC_APP_COMMIT || 'dev';

export interface VersionInfo {
  readonly version: string;
  readonly commit: string;
}

export function getVersionInfo(): VersionInfo {
  return { version: APP_VERSION, commit: APP_COMMIT };
}

/** "0.2.0 (a1b2c3d)", or just the version when there is no real commit id. */
export function formatVersion(info: VersionInfo = getVersionInfo()): string {
  return info.commit && info.commit !== 'dev' && info.commit !== 'unknown' ? `${info.version} (${info.commit})` : info.version;
}

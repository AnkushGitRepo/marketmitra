// Authorisation for machine-to-machine cron endpoints that can spend an AI key or write records (code-scanning finding on #132).
// A secret is required everywhere except a non-hosted development instance reached on a loopback host.

import { bearerMatches } from './secrets';

export type CronAuth = { ok: true } | { ok: false; status: number; error: string };

/** True only for a loopback host (localhost, 127.0.0.1, [::1]), with or without a port. */
export function isLocalHost(host: string | null): boolean {
  if (!host) return false;
  const bare = host.startsWith('[') ? host.slice(0, host.indexOf(']') + 1) : host.split(':')[0];
  return bare === 'localhost' || bare === '127.0.0.1' || bare === '[::1]';
}

export function authorizeCron(request: Request, env: { secret: string | undefined; nodeEnv: string | undefined; hosted: boolean }): CronAuth {
  if (!env.secret) {
    const devOpen = env.nodeEnv !== 'production' && !env.hosted && isLocalHost(request.headers.get('host'));
    return devOpen ? { ok: true } : { ok: false, status: 503, error: 'CRON_SECRET is not configured' };
  }
  if (!bearerMatches(request.headers.get('authorization'), env.secret)) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true };
}

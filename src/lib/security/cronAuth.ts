// Authorisation for machine-to-machine cron endpoints that can spend an AI key or write records (code-scanning findings on #132).
// A bearer CRON_SECRET is required in every environment. There is deliberately no "open in development" path: any such path would have
// to trust something the caller controls (the Host header, NODE_ENV on a preview deployment), and this endpoint can spend a user's key.

import { bearerMatches } from './secrets';

export type CronAuth = { ok: true } | { ok: false; status: number; error: string };

export function authorizeCron(request: Request, secret: string | undefined): CronAuth {
  if (!secret) return { ok: false, status: 503, error: 'CRON_SECRET is not configured' };
  if (!bearerMatches(request.headers.get('authorization'), secret)) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true };
}

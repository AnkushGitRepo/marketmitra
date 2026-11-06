/** Where the agent worker calls back into itself.
 *
 * These self-calls carry `CRON_SECRET`. Building the target from the incoming
 * request's URL means a forged `Host` / `X-Forwarded-Host` header can point it
 * at an attacker's server and hand over the secret — so production never uses
 * the request for this. Order: configured app URL → Vercel's platform-set
 * production URL → loopback (self-host). The request origin is dev-only. */
export function resolveInternalOrigin(env: Record<string, string | undefined>, requestUrl: string): string {
  const configured = env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  if (env.NODE_ENV !== 'production') return new URL(requestUrl).origin;
  return `http://127.0.0.1:${env.PORT || '3000'}`;
}

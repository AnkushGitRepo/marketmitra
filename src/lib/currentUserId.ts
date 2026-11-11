import { isHosted } from '@/lib/deployment-mode';
import { parseBearer } from '@/lib/tokens/pat';

async function readAuthorization(): Promise<string | null> {
  try {
    const { headers } = await import('next/headers');
    return (await headers()).get('authorization');
  } catch {
    // Outside a request scope there is no header to read.
    return null;
  }
}

// Self-host mode is "no login, single local user" (ADR 0010) — every
// self-hosted deployment's data belongs to this one fixed id. Hosted mode
// uses the real Clerk user id. Route handlers must always call this rather
// than reading Clerk directly, so the selfhost placeholder stays
// centralized in one place per ADR 0010's own guidance.
export async function getCurrentUserId(opts: { allowPat?: boolean } = {}): Promise<string | null> {
  if (!isHosted()) {
    return 'local';
  }
  // A personal access token (ADR 0053) is checked before Clerk. A malformed or unknown token
  // is a 401, never a fall-through to a browser session.
  const authorization = await readAuthorization();
  if (authorization && /^bearer\s+mm_pat_/i.test(authorization)) {
    // Routes that must never accept a token (settings, token management, logs) opt out here, so
    // they stay protected even if the proxy gate changes.
    if (opts.allowPat === false) return null;
    const token = parseBearer(authorization);
    if (!token) return null;
    const { resolveToken } = await import('@/lib/tokens/store');
    return (await resolveToken(token))?.userId ?? null;
  }
  const { auth } = await import('@clerk/nextjs/server');
  const { userId } = await auth();
  return userId;
}

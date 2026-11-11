# 0053 — Personal access tokens for the session-scoped API

Status: accepted (2026-11-11, issue #91)

## Context

The data API authenticates with the Clerk browser session cookie (hosted) and is open in self-host mode (ADR 0010). Scripts, bots
and cron jobs for a hosted account had no way in. We want a bearer token for a user's own account without weakening anything
else, and without a paid tier (ADR 0011/0016).

## Decision

- **Format:** `mm_pat_<r|w>_<43 chars base64url of 32 random bytes>`. The scope letter is part of the hashed token, so it cannot
  be flipped without changing the hash. Only a **SHA-256 hash** is stored (the token has 256 bits of entropy, so there is nothing
  to brute-force); the plaintext is returned once at creation and never retrievable. Collection `apiTokens`
  (`userId, name, scope, prefix, hash, createdAt, expiresAt, lastUsedAt, revokedAt`), unique index on `hash`.
- **Scopes:** `read` (GET / HEAD / OPTIONS) and `write` (all methods). Optional expiry (30 / 90 / 365 days or never, default 90),
  at most **10 active tokens** per user (revoked and expired ones do not count). Revocation is immediate.
- **Where it is enforced (two layers):**
  1. `src/proxy.ts` (hosted only) runs `checkPatRequest` with no database: tokens work only on `/api/*`, are refused on the blocked
     paths, and a read token is refused on writes. Rate limiting uses the existing `default` tier keyed **per token hash**, not per IP.
  2. `getCurrentUserId()` resolves a bearer token before Clerk: look up the hash, require not revoked and not expired, return the
     owner. A malformed or unknown token is a 401 and **never falls through to a browser session**. `lastUsedAt` is refreshed at
     most every 5 minutes.
- **Never reachable with a token** (`isPatBlockedPath`): `/api/settings/*` (stored AI key, notification channels, data export,
  account deletion, **and token management**, so a token cannot mint or list tokens), `/api/cron`, `/api/advisor` (local-only,
  ADR 0035) and `/api/system/logs`. This mirrors Mitra's platform-API deny-list (ADR 0036). Management endpoints
  (`/api/settings/tokens`, `/api/settings/tokens/{id}`) therefore require a browser session.
- **Hardening from the security review:** the blocked-path match normalises first (percent-decoding, lower-casing, collapsing slashes,
  no trailing slash) and fails closed on anything undecodable or double-encoded. Every handler in the blocked families (settings,
  token management, system logs/emails) also calls `getCurrentUserId({ allowPat: false })`, so they stay closed even if the proxy
  gate changes. Because any well-formed token string would otherwise get its own rate-limit bucket, token requests are also limited
  per IP at the signed-in rate before the per-token bucket (and before any database lookup). The 10-token cap is re-checked after
  insert and the new token is removed if a parallel create pushed the user over it.
- **Self-host:** unchanged and open; the Settings card is hidden and token endpoints report "not used".
- **Audit:** create and revoke are written to the system event log (`source: tokens`, token id and scope, never the secret).
- **UI and docs:** Settings > Account > "API access tokens" (create, one-time reveal with copy, list with scope / expiry / last used,
  revoke with confirmation). `bearerAuth` is a security scheme in `openapi.json` and is listed on every session operation a token can
  reach; the API reference's Authentication section describes it.
- **Mitra's own tool** keeps using the session and stays independent of tokens.

## Consequences

- A leaked read token exposes that user's read data until revoked or expired; a leaked write token can also modify it. Both are
  bounded by the blocked list above, per-token rate limiting, expiry and the 10-token cap.
- Per-area scopes, IP allow-lists and token rotation were deliberately left out; they can be added without changing the format.
- The hosted flow needs Clerk, so it was not exercised end to end locally (see the session log).

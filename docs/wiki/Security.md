# Security

MarketMitra is public, open-source and (in hosted mode) open to sign-up — so "signed in" is **not** treated as a trust boundary. This page summarises how the project is protected and how to report a problem.

## Reporting a vulnerability

**Please don't open a public issue.** Use [GitHub's private vulnerability reporting](https://github.com/AnkushGitRepo/marketmitra/security/advisories/new). Include what's affected, steps to reproduce, and whether it applies to self-hosted, hosted, or both. There's no bounty — it's an unfunded open-source project — but every report is taken seriously and credited unless you prefer otherwise. The full policy is in [`SECURITY.md`](https://github.com/AnkushGitRepo/marketmitra/blob/main/.github/SECURITY.md).

## Automated scanning

| Control | Status | Covers |
| --- | --- | --- |
| **CodeQL** code scanning | on — every push, pull request and weekly | JavaScript/TypeScript, Python and the GitHub Actions workflows |
| **Secret scanning + push protection** | on | blocks a push that contains a detected secret |
| **Dependabot alerts and security updates** | on | known-vulnerable dependencies |
| **Dependabot version updates** | weekly, grouped | npm, the Python service and Actions versions |
| **Dependency review** | on every pull request | fails a PR that adds a high-severity vulnerable dependency |
| **Private vulnerability reporting** | on | confidential disclosure |

Results appear under the repository's **Security** tab.

## What the application does

- **Your AI keys are encrypted at rest** (AES-256-GCM) and never returned to the browser after saving. In hosted mode there is no operator key to fall back on.
- **Outbound requests are guarded.** User-supplied webhook URLs and the PDF downloader reject private, loopback and cloud-metadata addresses, validate every redirect, cap response sizes, and connect to the exact IP that was validated (so DNS can't be rebound between the check and the connection).
- **Secrets are compared in constant time** — cron and ingest tokens everywhere, in both services — and the protected endpoints **fail closed**: if a token isn't configured, they refuse rather than open up.
- **Operator data is allowlisted.** The System page (`/system`, hidden from the sidebar) and its event log require an id in `ADMIN_USER_IDS`; unset means nobody, and non-admins get a 404.
- **Browser hardening.** A strict Content-Security-Policy, HSTS, `nosniff`, frame protection, a referrer policy and a permissions policy are set on both services.
- **Cross-site writes are rejected.** State-changing `/api/*` requests from another site are refused (Origin / Sec-Fetch-Site); the anonymous MCP server is the deliberate exception.
- **Rate limiting** keys on the platform-set client address, not a header the client controls.
- **Logs can't be forged.** Untrusted values written to logs have their line breaks escaped.
- **Workflows run with least privilege** — each declares the minimum `GITHUB_TOKEN` permissions it needs.

Mitra's authority is bounded by which tools exist: it cannot change settings or billing, delete anything, or edit holdings, and its alert changes are bounded, reasoned and logged. See [Mitra Assistant](Mitra-Assistant).

## Scope notes

- **Self-hosted installs have no login screen** — a documented design choice for a single local user, not a vulnerability. Run it where only you can reach it, or put your own access control in front.
- **The MCP server and the public API are read-only and unauthenticated by design.** They expose public market data only.
- Reports about **hosted-mode** authentication or authorisation bypasses are in scope.

## Known open items

- Production runs on a Clerk **development** instance; moving to a production instance on a custom domain is tracked in the [Roadmap](Roadmap).
- The Content-Security-Policy keeps `'unsafe-inline'` for scripts and styles, because a nonce would force every page to render dynamically and lose the static landing page. The injection and exfiltration directives stay strict.
- Credentials from the old v1 stack remain in public git history (a database connection string, a news-API key and a JWT secret). History rewriting cannot un-leak them; they belong to the retired v1 stack and must be **revoked at their providers**.

The full audit and its reasoning are in [ADR 0032](Decision-Records).

# Security Policy

## Reporting a vulnerability

If you find a security vulnerability in MarketMitra, please **do not** open a public issue
or pull request describing it.

Instead, report it privately through
**[GitHub Security Advisories](../../../security/advisories/new)** for this repository. This
creates a private discussion visible only to you and the maintainer until a fix is ready.

Please include:

- A description of the vulnerability and its potential impact
- Steps to reproduce it (a minimal repro is ideal)
- The affected version/commit, and whether it's self-hosted, the hosted deployment, or both

You should get an initial response within a few days. There's no bug bounty — this is an
unfunded open-source project — but every report is taken seriously and credited in the fix,
unless you'd prefer otherwise.

## Supported versions

MarketMitra v2 (this repository, the Next.js + MongoDB Atlas rewrite) is the only version
receiving security updates. The original v1 (MERN stack) is unmaintained — see
[ADR 0001](../docs/decisions/0001-teardown-and-rebuild.md).

| Version | Supported          |
| ------- | ------------------ |
| v2 (`main`) | :white_check_mark: |
| v1          | :x:                |

## Scope notes specific to this project

- **BYO AI keys are encrypted at rest** (AES-256-GCM, see [ADR 0018](../docs/decisions/0018-ai-insights-scope.md))
  and are never logged or returned to the client in plaintext after save.
- **Self-hosted deployments have no authentication layer by default** (single local user —
  see [ADR 0010](../docs/decisions/0010-deployment-mode-gate.md)). This is a documented design
  choice, not a vulnerability — self-hosters are expected to run it on infrastructure they
  control or add their own access controls in front of it. Reports about *hosted*-mode auth
  bypasses are in scope; reports that self-host has "no login screen" are not, since that's
  documented, intended behavior.
- The MCP server at `/api/mcp` and the public API surface are **read-only, no-auth by
  design** ([ADR 0019](../docs/decisions/0019-phase-9-api-surface-mcp-rate-limiting.md)) — this
  is intentional for public market data, not an oversight.

If you're unsure whether something is in scope, report it anyway and we'll sort it out.

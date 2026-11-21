@AGENTS.md

# Cursor notes

The rulebook is **`AGENTS.md`**; live project state is **`docs/HANDOFF.md`**. This file is
Cursor-only convenience (like `CLAUDE.md` for Claude Code).

## What Cursor reads automatically

| Item | Purpose |
|------|---------|
| `AGENTS.md` | Workflow, safety, stack constraints |
| `docs/HANDOFF.md` | Where we are, open work, gotchas |
| `.cursor/rules/marketmitra.mdc` | Always-on summary of `AGENTS.md` |
| `.cursor/skills/*` | Project skills (session start, new issue, PR checks, end of session, gotchas), mirrored from `.claude/skills`; see `docs/agent-setup.md` |

## MCP (Model Context Protocol)

- **MarketMitra tools** — `.cursor/mcp.json` points at `http://localhost:3000/api/mcp`.
  Start `npm run dev` first; for production data without a local app, change the URL to
  `https://marketmitra-v2.vercel.app/api/mcp` (same shape as the copy snippet on `/api-docs`).
- **Playwright** — browser automation for E2E (same as global Claude Code `playwright` MCP).
- **Vercel** — enable the Vercel MCP integration in Cursor Settings → MCP, then authenticate
  when prompted (deployments, env var *names*, logs — never paste secret values into chat).

After editing `.cursor/mcp.json`, reload MCP servers from Cursor Settings or restart the window.

## Connectors

- **GitHub** — `gh` CLI (scopes: `repo`, `workflow`, `read:org`, `gist`, `project`) for issues,
  PRs, checks, and the project board. Sign in with `gh auth login` if commands fail.
- **Git** — branch from up-to-date `main`; never commit directly to `main`.

## Skills vs Claude Code

Claude Code hooks, permission prompts, and synced Cowork skills do **not** transfer. Project
skills under `.cursor/skills/` (kept in step with `.claude/skills` by `npm run agents:sync`) cover MarketMitra-specific habits; everything else is in
`AGENTS.md` and `docs/HANDOFF.md`.

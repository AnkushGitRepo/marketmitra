# Agent setup: using any coding agent on this repo

The rules live in one place, [`AGENTS.md`](../AGENTS.md); live state is in [`HANDOFF.md`](./HANDOFF.md). Each agent has a thin entry point
that points there, plus its own folder of project skills. Contributors can use Claude Code, Cursor, Antigravity or Codex (or any agent that reads
`AGENTS.md`) and get the same workflow.

| Agent | Entry point | Folder | What is in it |
|-------|-------------|--------|---------------|
| Any other agent | `AGENTS.md` | n/a | The rulebook |
| Codex | `AGENTS.md` (read natively, no extra file) | `.agents/` | `skills/` |
| Claude Code | `CLAUDE.md` (imports `AGENTS.md`) | `.claude/` | `settings.json` (shared permissions), `skills/` |
| Cursor | `CURSOR.md` | `.cursor/` | `rules/marketmitra.mdc` (always-on summary), `skills/`, `mcp.json` (local MCP, no secrets) |
| Antigravity | `GEMINI.md` | `.agent/` | `rules/` (a pointer only), `workflows/` (slash commands), `skills/` |

`GEMINI.md` takes precedence over `AGENTS.md` in Antigravity, so none of the Antigravity files may carry rules of their own; they point to
`AGENTS.md`. Change a rule in `AGENTS.md` only.

**Codex** reads `AGENTS.md` itself (it is well under Codex's 32 KiB default limit, `project_doc_max_bytes`; keep it that way) and looks for repo skills in
`.agents/skills`, with the same `SKILL.md` format. Note `.agents/` (Codex, plural) is a different folder from `.agent/` (Antigravity, singular). There is no
`CODEX.md`: unlike Cursor, Codex has nothing to add beyond the rulebook.

## Shared skills

Five skills, the same in all four folders (each tool reads only its own): `marketmitra-session-start`, `marketmitra-new-issue`,
`marketmitra-pr-checks`, `marketmitra-end-of-session`, `marketmitra-gotchas`.

- The canonical copy is **`.claude/skills/`**. Edit there, then run `npm run agents:sync` to mirror into `.cursor/skills/`, `.agent/skills/` and `.agents/skills/`.
- A test (`src/lib/agents/agentFolders.test.ts`) fails when the copies differ or a skill has no valid `name` and `description`.
- A skill is a procedure that defers to `AGENTS.md`; do not restate rules in it.

## What must never be committed

- `.claude/settings.local.json` and anything else in `.claude/` besides `settings.json` and `skills/` (ignored by `.gitignore`).
- Any `.env*` value, key, token or connection string, in an agent folder or anywhere. The same test scans the agent folders for secret-like
  strings. `.cursor/mcp.json` and `.claude/settings.json` hold no credentials; keep it that way (MCP servers that need a token are set up
  per person in the tool's own settings, not here).
- Screenshots and scratch files (they can show personal data).

## Adding another agent

Add a thin entry point that imports or points to `AGENTS.md`, its skills folder (extend `scripts/sync-agent-skills.sh` and the test), and
a row in the table above.

---
name: marketmitra-session-start
description: Start a MarketMitra coding session: read AGENTS.md and HANDOFF, check git, gh and the board. Use at the beginning of a new chat on this repo.
---

# MarketMitra session start

## Steps

1. Read **`AGENTS.md`** fully and **`docs/HANDOFF.md`** (at least "Where we are" and "Open work").
2. Skim **`docs/CODEMAP.md`** to find where things live, then read the **last three** entries of **`docs/session-log.md`**.
3. If **`docs/POST-PAUSE-CHECKS.md`** exists, read it: it lists production checks to run once Vercel is unpaused.
4. Run live checks (do not trust chat memory):
   - `git log --oneline -10`
   - `gh issue list` and `gh pr list`
   - Project board: https://github.com/users/AnkushGitRepo/projects/2
5. Before Next.js work, skim the relevant guide under `node_modules/next/dist/docs/` (v16 has breaking changes; middleware is `src/proxy.ts`).

## Reply template

Summarize for the maintainer:

1. `main` and production commit/version (from HANDOFF and `git log`, noting what you did not verify).
2. Open work you would tackle first.
3. The workflow for a **bug** and for a **feature** (issue, branch, PR, squash merge).
4. What you will **never** do without explicit approval (deploy to production, production migrations, secrets).

Do not change code until asked.

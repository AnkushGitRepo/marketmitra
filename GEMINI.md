# MarketMitra — Antigravity / Gemini entry point

All project instructions live in **[`AGENTS.md`](./AGENTS.md)** — read it fully and treat it as
authoritative. The current state of the project (what shipped, what is open, how to run and deploy,
known gotchas) is in **[`docs/HANDOFF.md`](./docs/HANDOFF.md)**.

This file deliberately contains **no rules of its own**: `GEMINI.md` takes precedence over
`AGENTS.md` in Antigravity, so any rule duplicated here could silently override the real one.
If you need to change a rule, change it in `AGENTS.md`.

Reminders that matter most (full detail in `AGENTS.md`):

- Create a GitHub issue first, then a branch `fix|feat|chore|docs/<issue#>-slug`, then a PR from the
  template with `Closes #N`; squash-merge when the required checks are green.
- Never deploy to production, run production migrations, or handle secrets without the maintainer's go-ahead.
- This is Next.js 16 with breaking changes — read `node_modules/next/dist/docs/` before writing Next code.
- Plans and walkthroughs you produce should name the issue number they belong to.

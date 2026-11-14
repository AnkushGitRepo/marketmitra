# 0062 — Local catch-up for scheduled analyst work

Status: accepted (2026-11-14, issue #193). Amends the worker bullet of [0058](./0058-analyst-desk.md).

## Context

The Analyst Desk stays current on the hosted site because GitHub Actions calls `POST /api/cron/stock-analysts` every 20 minutes and `POST /api/cron/analyst-dispatch` at 08:30 IST. Those workflows always target the hosted app. A local or self-hosted process never receives them, and the machine is off most of the time, so dossiers stay unbuilt, the evening check never runs and the morning brief never appears.

The work is already “what is due”, not “this 20-minute slot”: dossiers are a queue, the evening check is once per India day after 16:00 IST, and the morning brief is once per India day. A sweep after the app is open again reaches the same end state, later.

Running that work while the machine is off would need an always-on process that holds the local AI key. That is a different deployment. This decision covers the hours the app is actually running.

## Decision

- A non-hosted Node process starts a local runner when the server starts (`src/instrumentation.ts`), unless `LOCAL_AI_SCHEDULE=off`, the runtime is edge, or Next is in the production-build phase. The hosted site (`isHosted()`) never starts it and keeps using GitHub Actions.
- On start, in the background, the runner repeats the existing analyst sweep for the user `local` until a pass builds nothing and does not fill the heartbeat batch, or the daily cap defers the work. There is a hard cap of 15 passes. It then runs the morning dispatch once. While the process stays up, the sweep repeats every 20 minutes and the dispatch check every hour. A run in progress is not overlapped.
- The runner calls the same functions as the cron routes. It does not HTTP itself. A non-hosted process still only touches the user `local` (ADR 0058).
- Analyze now and the sweep share a process-local in-flight claim, so they cannot both spend the key on the same symbol. Analyze now answers 409 when a build is already running.
- On a local desk the roster refreshes about every 20 seconds while any analyst is still initializing, and for a few minutes after the page opens, so the results show up without a manual reload. The hosted desk does not poll.
- Price alerts, the screener, IPOs and corpus indexing are not part of this runner. A late alert catch-up can fire on a price that already moved.

## Consequences

- Opening the local app spends the configured AI key on dossiers that are still waiting, under the existing local daily cap. A second start does not rebuild a dossier that already exists.
- Hours the machine is off are still dark: no dossiers, no evening check and no morning email until the next time the app is running.
- `LOCAL_AI_SCHEDULE` is documented in `.env.local.example`. Unset means on.

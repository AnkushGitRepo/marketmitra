# 0058 — Analyst Desk: a persistent AI analyst per holding

Status: accepted (2026-11-11, epic #127, phase 1 #128)

## Context

Agents was a one-off "Run analysis" form. The maintainer asked for a desk: every holding gets a dedicated analyst that builds a dossier,
keeps a living journal and (later phases) rolls up into a morning dispatch. Decisions (2026-11-11): **fully automatic for every holding**;
the first release covers dossier + journal, morning dispatch, thesis invalidation alerts and chat with an analyst (as four phases);
**Level 2 (advisor) only in the local unrestricted mode** (ADR 0054), so hosted analysts stay at Level 1 and report facts.

## Decision (phase 1)

- **Model:** `stockAnalysts` (one per user and symbol: status `initializing | active | paused | error`, source `holding | watcher`,
  dossier, watch state, `lastCheckedAt`), `analystJournal` (timestamped entries) and `analystUsage` (AI calls per India day). At most 40
  analysts per user. A holding gets an analyst automatically (hook on `POST /api/holdings`, plus a backfill in the worker); any other
  ticker can be added as a watcher.
- **Free first, AI second.** The daily check (`detectEvents`, pure) is deterministic: a price move of 4% or more, a volume spike above
  2x the 20-day average, touching the 52-week high or low (reported once), new news (two or more items, or any negative), a new filing,
  or new quarterly results. A quiet day makes no AI call and writes nothing. A material event writes **one** journal entry; the AI reads
  it against the baseline thesis (impact positive / neutral / negative), and if the cap is reached, there is no key or the model fails,
  the event is still recorded as a plain fact. Nothing is ever lost to a cost control.
- **Cost guard (because "fully automatic" spends the user's own key unattended):** a per-user cap of 20 AI calls per India day across
  dossiers and journal entries; per-analyst pause; a master switch (`preferences.agents.auto`, default on) that stops new analysts and all
  scheduled work; the roster shows today's usage. A missing key leaves the analyst waiting with a visible note; a provider error pauses it
  with the reason.
- **Dossier (initiation, one AI call):** summary, business, three strengths, up to two vulnerabilities and an explicit "not assessed" list,
  from the same computed figures as the stock brief (ADR 0056). Our free sources do not have concalls, pledged shares, management or board
  profiles, or analyst reports, so the analyst says so instead of inventing them.
- **Worker:** `POST /api/cron/stock-analysts` (bearer `CRON_SECRET`), run every 20 minutes by `.github/workflows/stock-analysts.yml`. Each run
  backfills analysts, builds up to 4 pending dossiers and runs up to 12 due end-of-day checks (after the 15:30 IST close plus a buffer,
  once per India day). **Only the hosted deployment processes every user. A non-hosted instance only ever touches the user `local`**, because
  a local instance can be pointed at a database that also holds real users (found when the first local run created records for a hosted
  user; nothing was spent on their key because their key could not be decrypted with the local encryption key, and the records were
  reported to the maintainer).
- **Guardrail:** analysts report facts and observable thresholds. No buy / sell / hold, and no stop-loss revisions or rebalancing in guarded
  mode (the prompts forbid it).
- **UI:** `/agents` is now the analyst roster (status, last check, latest entry, Read dossier, Pause or Resume, Remove for watchers,
  Deploy watcher, usage, master switch) with the one-off multi-agent analysis kept below it; the stock page has an **Agent journal** tab.
  The API (`/api/analysts`, `/api/analysts/{symbol}`) is session-only because it controls unattended use of the user's AI key.
- **Chat (#131):** `POST /api/analysts/chat` streams a reply from one analyst (`symbol` set; grounded in its dossier, the last ten journal entries and the
  computed figures) or from the Root Agent (`symbol` omitted; grounded in every analyst's thesis, weak points and latest note, plus the portfolio summary).
  It is one model call with no tools, session-only, rate limited, not counted against the daily cap (the user starts it and sees it), and follows the
  guarded / unrestricted mode. Dossier and journal text is embedded as untrusted data. The prompts say what is not in our data, and forbid telling the
  user what to do with a position, because a real run showed the model drifting to "cut losses" wording under the plain guardrail. Chats are not saved.

## Consequences

- Day-to-day cost is bounded by the cap and is near zero when nothing happens.
- Existing holdings are backfilled the first time the worker runs after release; dossiers are built a few at a time under the cap.
- Phases 2 to 4 (morning dispatch, thesis invalidation alerts, chat with an analyst) build on this model.

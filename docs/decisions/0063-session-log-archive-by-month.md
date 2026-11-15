# 0063 — Session log: recent entries stay live, older ones are archived verbatim by month

Status: accepted (2026-11-15, issue #198). Replaces the "compressed rollup" step of the context maintenance protocol in `AGENTS.md`.

## Context

`docs/session-log.md` reached 105 entries and 192 KB, about 48k tokens. Every new session is told to read it, and it is ordered oldest first, so reading it from the top spends the context window on September before the last entries that matter.

The protocol said to roll the oldest entries up, compressed, into one file once the log passed 15 to 20 entries. It was not followed: writing a summary by hand is slow, and the summary loses what was actually said, so it cannot answer "what exactly did we find about X".

## Decision

- `docs/session-log.md` keeps only the newest entries. Past 15 entries the oldest move out until 12 remain (about 14 KB).
- Moved entries go, unedited, to `docs/archive/session-log/YYYY-MM.md`, by the month in each heading's date, oldest first. Nothing is deleted, summarised or reworded. The one edit is that relative links gain two levels, because the folder is two levels deeper.
- `docs/archive/session-log/README.md` says how to find an entry with grep and how to roll the log. Agents do not read the archive unless they need something from it.
- The older compressed rollup `docs/archive/session-log-archive.md` (Phases 0 to 10) stays as it is.
- One-time migration (#198): 93 entries moved (2026-09: 29, 2026-10: 1, 2026-11: 63), 12 kept. Checked by comparing the non-blank lines of the old log with the archive files plus the live log: the same 980 lines in the same order, apart from link targets.

## Consequences

- Reading `docs/session-log.md` costs about 4k tokens instead of 48k.
- A lookup of old work is one grep away and returns the original wording.
- The rolling is still a manual step, which is how the old rule failed. If the live log creeps past 15 entries again, a script or a CI check is the next step; it is not built now.
- `docs/HANDOFF.md` (about 43 KB) is now the largest file agents read each session. It is not changed here.

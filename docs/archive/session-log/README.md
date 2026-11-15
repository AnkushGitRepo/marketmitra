# Session log archive

[`docs/session-log.md`](../../session-log.md) keeps only the newest entries, so an agent can read it whole at the start of a session. Every older entry is here, **as it was written**, one file per month (`YYYY-MM.md`, oldest entry first). Nothing was deleted, summarised or reworded ([ADR 0063](../../decisions/0063-session-log-archive-by-month.md)). The only edit is that relative links gained two levels, because this folder is two levels deeper than `docs/`.

The older, compressed history of Phases 0 to 10 is in [`../session-log-archive.md`](../session-log-archive.md). It stays as it is.

## Finding an entry

Do not read these files whole (the biggest is about 100 KB). Search them, then read only the lines you need:

```bash
# every entry title, with its file and line number
grep -n '^## ' docs/archive/session-log/*.md

# entries that mention a topic (case-insensitive)
grep -rn -i 'cloud run' docs/archive/session-log/ | cut -c1-200

# read one entry: take its line number from the list above
sed -n '120,140p' docs/archive/session-log/2026-11.md
```

With the Read tool, pass `offset` and `limit` instead of reading the whole file.

## Rolling the live log

When `docs/session-log.md` has more than 15 entries:

1. Cut the oldest entries until 12 remain.
2. Append them to the end of `docs/archive/session-log/YYYY-MM.md` for the month in each heading's date, oldest first, unchanged. A new month gets a file with the same short header as the others.
3. If a moved entry has a relative link such as `./decisions/0021-x.md`, make it `../../decisions/0021-x.md`.

Do not summarise, shorten or reword an entry on the way.

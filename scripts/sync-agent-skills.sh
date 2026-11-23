#!/usr/bin/env bash
# Mirrors the canonical project skills (.claude/skills) into the other agents' folders:
#   .cursor/skills  (Cursor)   .agent/skills  (Antigravity)   .agents/skills  (Codex; plural, not the same as .agent)
# Each tool only reads its own directory, so the same files live in all four. Edit .claude/skills, then run `npm run agents:sync`.
# A test (src/lib/agents/agentFolders.test.ts) fails when the copies differ.
set -euo pipefail
cd "$(dirname "$0")/.."

src=".claude/skills"
[ -d "$src" ] || { echo "missing $src" >&2; exit 1; }

for dest in .cursor/skills .agent/skills .agents/skills; do
  mkdir -p "$dest"
  # Remove skills that no longer exist in the source, then copy the rest.
  for existing in "$dest"/*/; do
    [ -d "$existing" ] || continue
    [ -d "$src/$(basename "$existing")" ] || rm -r "$existing"
  done
  cp -R "$src"/. "$dest"/
  echo "synced $src -> $dest"
done

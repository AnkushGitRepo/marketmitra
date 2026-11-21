---
name: marketmitra-new-issue
description: Open a GitHub issue and cut the branch for a MarketMitra bug or feature, following the working agreement. Use when the maintainer reports a problem or asks for a feature, before touching code.
---

# New issue and branch (MarketMitra)

The rules are in `AGENTS.md` ("Working agreement"); this is the short procedure. If they differ, `AGENTS.md` wins.

1. **Check for an existing issue** (`gh issue list --search "<words>" --state all`). Work from it; never create a duplicate.
2. **Create the issue before touching code**, from the fields of `.github/ISSUE_TEMPLATE/` (`bug_report.yml` or `feature_request.yml`):
   ```bash
   gh issue create --title "fix: ..." --body-file /tmp/issue.md \
     --label bug --label "area: <area>" --label "priority: high" \
     --assignee AnkushGitRepo --milestone "<milestone>"
   ```
   Labels: a type (`bug`, `enhancement`, `documentation`), an `area: ...` label, and `priority: ...` for bugs. List them with `gh label list`.
   Milestones are one per release or goal; create a new one rather than reusing a finished one (`gh api repos/:owner/:repo/milestones`).
   A feature that arrives outside GitHub gets an issue with acceptance criteria in the body. If scope is genuinely ambiguous, confirm the criteria with the maintainer first.
3. **One branch per issue**, from an up-to-date `main`: `fix|feat|chore|docs/<issue#>-slug`. `main` is protected; never commit to it.
4. Commits are Conventional Commits (`feat fix refactor docs test chore perf ci`) and mention `#N` in the body.
5. Move the board item to In Progress when work starts (https://github.com/users/AnkushGitRepo/projects/2). Do not set Done by hand for unfinished work; that closes the issue.
6. Write the test first when adding logic.

Trivial doc typos do not need an issue. Dependabot PRs need none.

# 20260429-refactor-wait-pr-shared-lib

## Context

Issue: [#215](https://github.com/nownabe/graphein/issues/215)

### Background

PR #215 was created by `bin/handle-issue` but review comments were not being picked up, causing the wait loop to stay "pending" indefinitely. The root cause was `wait-pr.ts` resetting `since = new Date()` on every invocation, filtering out comments posted before the tool started.

### Summary

Extract `tools/wait-pr.ts` logic into `tools/lib/wait-pr.ts` as an importable `waitPr()` function. `bin/handle-issue` calls it directly instead of spawning a subprocess, passing `prCreatedAt` as the `since` baseline.

## Reviews

### Round 1 (Codex)

#### Review

Status: NEEDS_FIX
Reviewed commit: [fc463dc](https://github.com/nownabe/graphein/commit/fc463dcef377361713bf27465b7649bf6626f340)
Reviewer: Codex CLI (OpenAI)

1. **[P1] Reset the review baseline after each round** — `bin/handle-issue:365-374`
   Using a single `since` timestamp from PR creation makes `waitPr` keep returning comments/reviews that were already handled in earlier rounds. In particular, any Codex comment posted during phase 2 when `--codex-review` is enabled will be reported forever as new feedback, so phase 3 can immediately enter a fix loop even after the branch is updated successfully. The baseline needs to advance after each fix/push (or at least after each wait cycle) so only newly arrived feedback is considered actionable.

2. **[P2] Preserve repository cwd when calling `waitPr` directly** — `bin/handle-issue:373-374`
   This call no longer runs from `worktreePath`, but `waitPr` shells out to `gh pr ...` and `gh api repos/{owner}/{repo}/...`, which rely on the current working directory to resolve the repository. If `bin/handle-issue` is invoked from outside the repo, the wait loop will fail to query the PR. Passing the repo/worktree cwd into the library or changing directories before calling it avoids that regression.

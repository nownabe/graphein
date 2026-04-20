# 20260420-feat-codex-review-in-handle-issue

## Context

Issue: N/A

### Background

Adding a `--codex-review` option to `bin/handle-issue` so that Codex CLI can review PRs during the wait-pr loop and post findings as PR comments.

### Summary

Add `--codex-review` flag to handle-issue script that runs `codex review --base main` after PR creation and posts actionable findings as a PR comment.

## Reviews

### Round 1

#### Review

Status: NEEDS_FIX
Reviewed commit: [9d53160](https://github.com/nownabe/graphein/commit/9d531601d87e1f0deaf46a3437607eca41c56cbe)

1. `bin/handle-issue` line 231-233: The comment says "Run Codex review in parallel with waiting for CI/review" but `await runCodexReview(...)` runs sequentially, blocking before the for loop. Either remove the "in parallel" comment (if sequential is intended) or use a fire-and-forget pattern (e.g., assign to a variable without await before the loop and await it after/inside the loop).

2. `bin/handle-issue` lines 79-85 (`hasFindings` heuristic): The keyword check is too broad -- phrases like "No issues found" or "0 errors" will trigger false positives. The `output.length > 200` fallback means almost any non-trivial output gets posted. Consider posting all non-empty output unconditionally (the reviewer already produced it), or using a more structured signal from codex (e.g., exit code or a summary line).

3. `src/db/schema.ts` (oauth tables): `clientId` in `oauthAuthorizationCodes` and `oauthRefreshTokens` has no FK constraint to `oauthClients.clientId`. If a client is deleted, orphan rows remain with no referential integrity. Consider adding `.references(() => oauthClients.clientId)` or document why this is intentionally omitted.

#### Fix

Fixed files:

- bin/handle-issue

1. Fixed misleading "in parallel" comment — changed to "before entering the wait loop" (sequential was intended).
2. Removed the overly broad keyword heuristic — now posts all non-empty codex output unconditionally.
3. Skipped — pre-existing schema issue unrelated to this PR.

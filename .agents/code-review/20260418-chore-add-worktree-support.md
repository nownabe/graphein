# 20260418-chore-add-worktree-support

## Context

Issue: N/A

### Background

Add git worktree isolation support so the issue-handler agent runs in a separate worktree, preventing conflicts with the main working directory.

### Summary

Add issue-handler agent definition with worktree isolation, .worktreeinclude for .envrc, and .gitignore entry for .claude/worktrees/.

## Reviews

### Round 1

#### Review

Status: NEEDS_FIX
Reviewed commit: [accee36](https://github.com/nownabe/graphein/commit/accee3616493f6f691ac5724c9cc3071c5781279)

1. **DB connection leak in `test/e2e/global-setup.ts` (line 10-11)**: `createDb()` opens a postgres connection pool via `postgres(databaseUrl)` but never closes it. Since Playwright's `globalSetup` runs as a standalone function (not inside a long-lived process like bun:test's `beforeAll`), the open connection pool will prevent the setup process from exiting cleanly, potentially causing Playwright to hang or timeout. After `migrate()`, call `await db.$client.end()` to close the pool. Note: the integration test `test/integration/setup.ts` has the same pattern, but it runs within the bun:test process which exits on its own -- still not ideal, but less likely to cause hangs.

### Round 2

#### Review

Status: APPROVED
Reviewed commit: [141b28b](https://github.com/nownabe/graphein/commit/141b28b4097b276aef8786461f5e1533bddc7edb)

The round 1 issue (DB connection leak in `test/e2e/global-setup.ts`) has been fixed -- `await db.$client.end()` is now called after `migrate()`. The rest of the changes are well-structured: E2E test infrastructure (Playwright config, fixtures, helpers, smoke test), integration test reorganization into `test/integration/`, direnv setup, worktree support, and documentation updates all look correct. No new issues found.

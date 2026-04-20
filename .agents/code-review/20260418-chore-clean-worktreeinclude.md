# 20260418-chore/clean-worktreeinclude

## Context

Issue: N/A

### Background

The project switched from `.env` to `.envrc` (direnv) for environment variable management. The `.worktreeinclude` file previously listed `.envrc` to ensure it was included in git worktrees, but since `.envrc` is now managed by direnv and checked into the repo, it no longer needs special worktree inclusion.

### Summary

Remove `.envrc` from `.worktreeinclude`, leaving the file empty.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [729aac7](https://github.com/nownabe/graphein/commit/729aac75b8a0a2e289bfc3bf0dbb6243fbb52365)

Change is straightforward: removes the now-unnecessary `.envrc` entry from `.worktreeinclude`. No issues found.

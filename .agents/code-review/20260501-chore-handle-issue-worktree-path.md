# 20260501-chore/handle-issue-worktree-path

## Context

Issue: N/A

### Background

Move handle-issue worktree creation from a sibling directory (`../handle-issue-*`) to `.agents/worktrees/` inside the project, keeping the directory structure organized.

### Summary

Changed worktree base path in `bin/handle-issue` and added `.agents/worktrees/` to `.gitignore`.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [d04ff94](https://github.com/nownabe/graphein/commit/d04ff94514045d1b0570a903e0098f6346db2466)

The change is straightforward and correct. The worktree base path is moved from a sibling directory outside the repo to `.agents/worktrees/` inside the repo, and the corresponding `.gitignore` entry is added. The absolute path resolution via `git worktree list --porcelain` on line 225 ensures downstream usage is unaffected by the relative path change.

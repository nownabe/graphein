# 20260420-chore-move-handle-issue-to-bin

## Context

Issue: N/A

### Background

Separating human-facing CLI tools (bin/) from agent-facing tools (tools/) for clarity.

### Summary

Move handle-issue.ts from tools/ to bin/handle-issue, make it executable, remove from AGENTS.md.

## Reviews

### Round 1

#### Review

Status: NEEDS_FIX
Reviewed commit: [2b73ba7](https://github.com/nownabe/graphein/commit/2b73ba7aeb190582a79df7229c7ae675f571981a)

1. `bin/handle-issue` lines 6 and 23 still reference the old path `tools/handle-issue.ts`. Update both to `bin/handle-issue` to match the new location.

### Round 2

#### Review

Status: APPROVED
Reviewed commit: [2153fcd](https://github.com/nownabe/graphein/commit/2153fcd15cf03aa09e42257625d6152fdf01ede1)

Round 1 feedback addressed. Path references in the script now correctly point to `bin/handle-issue`. No remaining issues.

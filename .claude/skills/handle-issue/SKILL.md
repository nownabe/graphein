---
name: handle-issue
description: >-
  Handle a GitHub Issue end-to-end in an isolated worktree.
  Use when the user specifies a GitHub Issue number or URL to work on.
disable-model-invocation: false
allowed-tools:
  - Bash
argument-hint: "<issue number or URL>"
---

# Handle Issue

Run the orchestrator script to handle the issue end-to-end. Set a 3600000ms (1 hour) timeout:

```bash
bun run tools/handle-issue.ts $ARGUMENTS
```

The script controls the workflow deterministically:

1. Spawns `claude` CLI in a worktree to implement the issue and create a PR
2. Runs `wait-pr.ts` to poll for CI/review
3. If fixes are needed, spawns `claude` CLI again to fix
4. Repeats 2-3 until approved (max 5 fix rounds)

Progress is printed to stdout — relay it to the user as it appears.

---
name: handle-issue
description: >-
  Handle a GitHub Issue end-to-end in an isolated worktree.
  Use when the user specifies a GitHub Issue number or URL to work on.
disable-model-invocation: false
allowed-tools:
  - Agent
argument-hint: "<issue number or URL>"
---

# Handle Issue

Delegate the issue to the `issue-handler` agent in an isolated worktree.

Use the `Agent` tool with the following parameters:

- `subagent_type`: `"issue-handler"`
- `isolation`: `"worktree"`
- `prompt`: Pass through the arguments exactly: `$ARGUMENTS`
- `description`: `"Handle issue $ARGUMENTS"`

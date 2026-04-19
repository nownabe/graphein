# 20260419-feat-create-pr-and-wait-tool

## Context

Issue: N/A

### Background

Add a `create-pr-and-wait` CLI tool that replaces direct `gh pr create` usage. The tool creates PRs and monitors CI/review status, enabling the `/pr` skill to wait for CI pass and LGTM approval before completing. This supports a fully automated PR lifecycle where the agent can react to CI failures and review comments.

### Summary

- New `tools/create-pr-and-wait.ts` with `create` and `check` subcommands
- Forbid `gh pr create` in hooks, redirect to the new tool
- Update `/pr` skill with wait-for-CI-and-review loop (step 6)
- Update settings.json permissions

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [9876e05](https://github.com/nownabe/graphein/commit/9876e0588d6232d254fdfe89af4c3679d36e83e0)

The tool is well-structured with clean separation between `create` and `check` subcommands, proper error handling, parallel API fetching, and clear exit code semantics. The SKILL.md updates provide a thorough poll loop workflow. The hooks and settings changes are consistent with existing patterns. No bugs, security issues, or logic errors found.

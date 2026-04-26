# 20260426-chore-add-gh-api-pr-reviews-hook

## Context

Issue: N/A

### Background

Adding a pre-bash hook to redirect `gh api` PR review calls to `@nownabe/claude-tools gh get-pr-reviews`, ensuring consistent tooling usage across the project.

### Summary

Add a forbidden pattern entry in `.claude/nownabe-claude-hooks.json` to block `gh api */pulls/*/reviews*` and suggest using `bunx @nownabe/claude-tools gh get-pr-reviews` instead.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [2eed817](https://github.com/nownabe/graphein/commit/2eed817a27f883a28ddf23278123e00151a74e6a)

Changes look correct. The `security` declarations are added consistently to all 15 API routes, the new Claude hook pattern is well-formed, and the two new integration test files follow the established patterns from existing tests (api-tasks.test.ts, etc.). Test coverage is thorough with positive, negative, edge case, and authorization checks for each admin endpoint.

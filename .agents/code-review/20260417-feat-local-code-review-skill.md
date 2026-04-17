# 20260417-feat-local-code-review-skill

## Context

Add a local code review skill (`/code-review`) with a dedicated `code-reviewer` sub-agent, and integrate it into the `/pr` workflow.

Issue: N/A

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [b82fa78](https://github.com/nownabe/graphein/commit/b82fa780675a031f79ff8c68d8515deb16bd3cab)

All changes are configuration/documentation files for Claude Code agent orchestration (new code-reviewer agent, code-review skill, and PR skill update). No application code is modified. The agent definitions are well-structured, tool permissions are appropriately scoped, and the PR skill step numbering was correctly updated. No bugs, security issues, or convention violations found.

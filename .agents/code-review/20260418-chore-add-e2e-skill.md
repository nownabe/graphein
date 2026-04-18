# 20260418-chore-add-e2e-skill

## Context

Issue: N/A

### Background

Adding an E2E testing skill to enable quick, repeatable end-to-end testing of all Slack-to-Graphein integration paths. This was motivated by the need to verify refactored code (e.g., `resolveSlackUserToDb` helper) works correctly across all 5 integration paths: 3 message shortcuts and 2 event listeners.

### Summary

Add a new Claude Code skill (`/e2e`) that automates E2E testing of Slack shortcuts and event listeners using Playwright MCP, with verification via both Graphein UI and database queries. Also registers the skill in `.claude/settings.json`.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [a659d92](https://github.com/nownabe/graphein/commit/a659d92b63e6d20fffdc86dbaa132b6185a6bfda)

Changes are configuration/documentation only: a new E2E skill definition and its registration in `.claude/settings.json`. The skill document is well-structured with clear test steps, SQL verification queries, and browser automation guidance. No application code is modified. No issues found.

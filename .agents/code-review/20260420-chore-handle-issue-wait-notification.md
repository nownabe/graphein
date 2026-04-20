# 20260420-chore-handle-issue-wait-notification

## Context

Issue: N/A

### Background

When the handle-issue skill delegates to a subagent that runs the PR wait loop, the user has no visibility into whether the system is waiting or actively working. The subagent blocks for ~5 minutes with no output visible to the user. This change restructures the workflow so the main agent notifies the user between phases.

### Summary

Split create-pr-and-wait.ts into two focused tools (create-pr.ts and wait-pr.ts). Restructure handle-issue skill as a multi-phase orchestrator that notifies users between long-running steps. Update PR skill to use the new tools.

## Reviews

### Round 1

#### Review

Status: APPROVED
Reviewed commit: [16c1d08](https://github.com/nownabe/graphein/commit/16c1d08ef16a4a2218c13e6d450eef88cb22f263)

Clean refactoring that splits `create-pr-and-wait.ts` into two focused tools (`create-pr.ts` and `wait-pr.ts`), updates all skill documentation and hook configurations consistently, and restructures the handle-issue skill as a multi-phase orchestrator. No logic errors, security issues, or stale references found.

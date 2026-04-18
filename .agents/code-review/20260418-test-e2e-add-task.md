# 20260418-test-e2e-add-task

## Context

Issue: #102

### Background

Part of #99 — implementing E2E tests for Graphein. This PR adds a Playwright E2E test for the Add Task shortcut flow, verifying that tasks created via the Slack shortcut appear correctly in the database and Graphein web UI.

### Summary

Add E2E test file `test/e2e/add-task.test.ts` with two test cases:

1. Basic task creation with DB and UI verification
2. Task creation with thread reply confirmation

## Reviews

### Round 1

#### Review

Status: NEEDS_FIX
Reviewed commit: [74515fd](https://github.com/nownabe/graphein/commit/74515fdec71e9d8df78092604829e78f946dfa11)

1. **Shared mutable `slackMessageTs` not reset after cleanup** (`test/e2e/add-task.test.ts`, line 22 + afterEach): The `slackMessageTs` variable is shared across tests but never reset to `undefined` after `afterEach` runs. If a second test fails before assigning a new value to `slackMessageTs`, the `afterEach` will attempt to delete the already-cleaned-up message/task from the previous test. Set `slackMessageTs = undefined!` (or use a nullable type and reset to `undefined`) at the end of `afterEach`.

2. **Thread reply not cleaned up in Slack** (`test/e2e/add-task.test.ts`, line 108-112): The second test posts a reply in a thread via `slackClient.chat.postMessage`, but `afterEach` only deletes the parent message. Slack does not cascade-delete thread replies when the parent is deleted. The bot reply will linger in the channel. Store the reply `ts` and delete it in `afterEach`, or delete thread replies before deleting the parent.

3. **Unnecessary dynamic import** (`test/e2e/add-task.test.ts`, line 107): `getSlackClient` is dynamically imported with `await import("./helpers/slack")` despite other exports from the same module already being statically imported at the top of the file (line 4-9). Use the existing static import instead: just add `getSlackClient` to the import on line 4.

#### Fix

Fixed files:

- test/e2e/add-task.test.ts

1. Changed `slackMessageTs` to `string | undefined`, added `replyTs` variable, and reset both to `undefined` at end of `afterEach`.
2. Store the reply `ts` from `slackClient.chat.postMessage`, delete it in `afterEach` before the parent message.
3. Added `getSlackClient` to the static import from `./helpers/slack` and removed the dynamic import.

### Round 2

#### Review

Status: APPROVED
Reviewed commit: [5ed909e](https://github.com/nownabe/graphein/commit/5ed909ea6c2bd2ec9bd21dba84ef4792ac81da81)

All three round 1 issues have been correctly addressed: `slackMessageTs` is now typed as `string | undefined` and reset after cleanup, thread reply `ts` is tracked and deleted in `afterEach` before the parent message, and `getSlackClient` uses the existing static import. TypeScript compiles cleanly. No new issues found.
